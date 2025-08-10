'use strict'
/* rolling dice */
/* Contributed by mozai@wetfish */
/* how was this not already in the mix */

/* Use:  .roll 100 => 1d100 => "eevee rolled a 42"
         .roll 3d6 => "eevee rolled 4,3,5 (12)"
         .roll 2d6+1 => "eevee rolled 2,3 (6)
         2d20k => 2 [1..20] keep highest 1 (D&D "roll with advantage)
         2d20k-1 => 2 [1..20] drop highest 1 (D&D "roll with disadvantage)
         4d6k3 => 4 [1..6] keep highest 3
         2d6! or 2d6x => exploding sixes, roll more dice
         4dF => Fudge dice with faces "+","o","-" [-1,0,+1]
         d66 => sometimes "2d6 but as a two-digit base-6 number"
ref. https://en.m.wikipedia.org/wiki/Dice_notation#Variationas_and_expansions
*/

/* TODO: 5d6dh1dl1  five dice, drop highest one and lowest one */
/* TODO: colours */
/* TODO: .roll ORE / .roll 9ore10 */

/* -- dependencies -- */
import { default as clog } from 'ee-log'
import { default as ircColor } from 'irc-colors'
import { handleSIGINT, ipc, lockPidFile, setPingListener } from '../lib/common.mjs'

/* -- config start -- */

/* wait 2 seconds between die-rolls */
const throttle = 2 
/* even if you play Shadowrun you don't need this many dice */
const maxnum = 64
/* d1000 is the biggest die I ever saw */
const maxsize = 65535

/* -- init start -- */

const ident = 'roll'
lockPidFile(ident)
setPingListener(ipc, ident, 'init')
const unixtime=_=>Math.round((Date.now()/1000))
var lasttime=0
const sum = x => x.reduce((a,b)=>a+b)

/* Advantage: keep=n-1 Disadvantage: keep=-(n-1) */
function rollPolyhedra(n=2,s=6,b=0,x=0,k=0) {
  /* roll n dice of s sides, 
     add b to the final sum,
     if x>0  dice showing s+1-x, roll another die
     if x<0  dice showing abs(-x) or less, roll another die
     if k>0, keep the k highest dice,
     if k<0, keep the k lowest dice
  */ 
  /* sane-ify all inputs */
  n = Math.round(Math.min(n,maxnum))
  s = Math.round(Math.min(s,maxsize))
  b = Math.round(Math.min(b,maxsize))
  if(x<0) x = -1 * Math.round(Math.min(s,Math.abs(x)))
  else if(x>0) x = Math.min(s,x)
  k = Math.round(Math.min(n,k))
  let text = `rolling ${n}d${s}`
  if(x!=0) text += '!'
  if(k>0) text += `k${k}`
  else if(k<0) text += `d${-1*k}`
  if(b>0) text += `+${b}`
  else if(b<0) text += `${b}`
  let rolled = [...Array(n)].map(_=>Math.ceil(Math.random()*s))
  let keep = []
  while(rolled.length > 0) {
    if(x>0 && (rolled[0] > s - x))
        rolled.push(Math.ceil(Math.random()*s))
    else if(x < 0 && rolled[0] <= x)
        rolled.push(Math.ceil(Math.random()*s))
    keep.push(rolled.shift())
    if(keep.length >= maxnum) break
  }
  if(k!=0){
    keep.sort()
    if(k>0) keep.reverse()
    keep = keep.splice(0,Math.abs(k))
  }
  text += ` (${keep.toString()}) ${sum(keep)+b}`
  return text
}

function rollFudge(n=4) {
  /* 4dF -> rolled (-,o,+,+) 1" */
  n = Math.round(Math.min(n,maxnum))
  let text = `rolling ${n}dF`
  const faces = ['-','o','+']
  let rolled = [...Array(n)].map(_=>Math.floor(Math.random()*3))
  text += ` (${rolled.map(_=>faces[_])}) ${sum(rolled)-n}`
  return text
}

function rollORE(n=9,s=10) {
  n = Math.round(Math.min(n,maxnum))
  s = Math.round(Math.min(s,maxsize))
  /* quirk of ORE: you mustn't roll more dice than faces */
  n = Math.round(Math.min(n,s))
  let text = `rolling ${n}ore${s}`
  let p1 = {}, p2 = {};
  [...Array(n)].map(_=>{let x=Math.ceil(Math.random()*s);p1[x]=(p1[x]||0)+1;})
  p2 = Object.entries(p1).map(x=>[x[1],x[0]])
  p2.sort((a,b)=>(b[0] - a[0] || b[1] - a[1]))
  p1 = p2.map(x=>`${x[0]}x${x[1]}`)
  text += ` (${p1.join(",")})`
  return text
}


/* -- the commands from users -- */
var help = []
var lasttime = 0

ipc.subscribe('roll.request', (data) => {
  const request = JSON.parse(data)
  let text = ""
  if((Date.now() - lasttime) < throttle){
    text = "Wait." 
    /* return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify({target: request.nick, text: text})) */
    return
  }
  if(!request.args){
    text = "What do you want me to roll? e.g. XdY+Z for X Y-sided dice adding Z to sum"
    /* return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify({target: request.nick, text: text})) */
    return
  }
  const reply = {target: request.channel, text: ""}
  const args = request.args.trim().split(' ').splice(0,1)
  let found
  /* "100" => "rolling 1d100 (42) 42" */
  found = args[0].match(/^(\d+)$/)
  if(found && Number(found[1])>0) {
    reply.text = rollPolyhedra(1,Number(found[1]))
    if(reply.text) {
      lasttime = Date.now()
      return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply))
    }
  }
  /* "2d6" => "rolling 2d6 (4,3) 7" */
  /* "2d6+2" => "rolling 2d6+2 (4,3) 9" */
  /* "4d6k1" => "rolling 4d6k1 (6,5,5) 16" */
  /* "3d6!" => "rolling 3d6! (3,2,6,2) 13" */
  found = args[0].match(/^(\d*)d(\d*)(!)?(k-?\d+)?([+-]\d+)?$/)
  if(found) {
    reply.text = rollPolyhedra(Number(found[1] || 1), Number(found[2] || 6), Number(found[5] || 0), (found[3] && 1 || 0), (found[4] && Number(found[4].substr(1)) || 0))
    if(reply.text) {
      lasttime = Date.now()
      return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply))
    }
  }
  /* "4dF" => "rolling 4dF (-,-,+,o) -1" */
  found = args[0].match(/^(\d*)dF$/)
  if(found) {
    reply.text = rollFudge(Number(found[1]))
    if(reply.text) {
      lasttime = Date.now()
      return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply))
    }
  }
  /* "9ore10" => "rolling 9ore10 (2x10,2x4,2x3,1x9,1x6,1x1)" */
  found = args[0].match(/^(\d+)ore(\d+)$/i)
  if(found) {
    reply.text = rollORE(Number(found[1]), Number(found[2]))
    if(reply.text) {
      lasttime = Date.now()
      return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply))
    }
  }
  /* TODO: "d20 with advantage"  "d20+7 with disadvantage" */
  /* "4d6 keep 3" => "rolling 4d6k1 (6,5,5) 16" */
  found = request.args.trim().match(/^(\d+)d(\d+)\s+keep\s+(\d+)$/i)
  if(found) {
    reply.text = rollPolyhedra(Number(found[1]), Number(found[2]), 0, 0, Number(found[3]))
    if(reply.text) {
      lasttime = Date.now()
      return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply))
    }
  }
})
help.push({ command: 'roll', descr: 'Roll dice like a D&D nerd',
   params: [
     {param: 'dicenotation', required: true, descr: `XdY+Z or XdF or XdY! or 4d6k3`}
   ] })


/* when I'm loaded */
ipc.on('start', () => {
  if (process.send) process.send('ready')
  ipc.publish('_help.update', JSON.stringify({ from: ident, help: help, }),)
  setPingListener(ipc, ident, 'running')
})
/* when if I'm asked to reassert my help strings */
ipc.subscribe('_help.updateRequest',()=>{
  ipc.publish('_help.update',JSON.stringify({from:ident,help:help}))
})
/* when I'm unloaded */
process.on("SIGINT",()=>{if(db)db.close();handleSIGINT(ident,ipc)})

