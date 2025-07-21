'use strict'
/* Dueling-fluff module for eevee */
/* Contributed by mozai@wetfish */

/* Use:  .duel <defender>
         => "You and <defender> get into a fight using <arglebargles>.  You wins!"
         .duelrank <name>
         => "Name has rank <arglebargle>"
   Behind the scenes:
   * flips a coin, picks a random fight-results string.
   * ranking is exponential moving average between 0.0 and 1.0,
     but hide true rank behind vague sequence of names
*/
/* TODO: .duel <missingperson> => "<missingperson> isn't here" */
/* TODO: for three-way duels, multiple {loser} entries */

/* -- dependencies -- */
import { default as clog } from 'ee-log'
/* import { default as ircColor } from 'irc-colors' */
import { getConfig, getDirName, handleSIGINT, ipc, lockPidFile, setPingListener } from '../lib/common.mjs'
import { default as sqlite3 } from 'better-sqlite3'

/* config moved to etc/duel.hjson */

/* -- Init start -- */

const debug = true
const ident = 'duel'
lockPidFile(ident)
setPingListener(ipc, ident, 'init')

const config = getConfig(ident)
const LUCKYDAYSALT=config.luckydaysalt||"fish"
const throttle = config.throttle||1000
const dbFilename = config.dbFilename||"duel.sqlite"
const dbParameters = config.dbParmeters||{readonly:false, fileMustExist: false}
if(debug) dbParameters.verbose = console.log
let methods = config.methods||["You {compete|fight|duel}, and {winner} wins."]
let ranks = config.ranks||[ ["very-low-tier", "low-tier", "mid-tier", "high-tier", "very-high-tier"] ]

/* --- helpers --- */
/* unixtime() => 1752957151 */
const unixtime=_=>Math.round((Date.now()/1000))
/* flatnick('Mozai|k|23') => 'mozaik23' */
const flatnick=a=>a.toLowerCase().replace(/[^a-z0-9]/,"")
/* choose([1,2,3]) => 2 */
const choose=a=>a[Math.floor(Math.random()*a.length)]
/* a=[1,2,3,4];shuffle(a); => a=[3,1,4,2] */
const shuffle=a=>{let b=[];while(a.length){b.push(a.splice(Math.random()*a.length,1)[0])}while(b.length){a.push(b.pop())}}
/* this one's less obvious. It picks a random card off the top half of the deck, then returns that card back onto the bottom */
const choosefresh=a=>{let b=a.splice(Math.floor(Math.random()*a.length/2),1)[0];a.push(b);return b;}
/* madlibs("{who} should eat {beef|chicken|rice}", {"who":"Kevin"}) => "Kevin should eat rice" */
const madlibs=(a,b)=>{const re=/\{(.*?)\}/g;let r,c=a;while(r=re.exec(a)){if(b[r[1]]!==undefined)c=c.replace(r[0],b[r[1]]);else if(r[1].includes("|"))c=c.replace(r[0],choose(r[1].split('|')))}return c}
/* luckyday("Rachel") => 4 */
const luckyday=(a)=>{a=flatnick(LUCKYDAYSALT+a);let b=0;for(const c of a){b+=c.charCodeAt(0);b%=7;}return b;}

/* --- the saved state stuff --- */
var db = undefined
const __dirname = getDirName() /* probably $(dirname eevee)/lib/ */
let tableName="duel"
try{tableName=`duel-${moduleInstance}`;}catch{}
try {
  db = new sqlite3(`${__dirname}/../db/${dbFilename}`, dbParameters)
  /* sqlite3 has only five datatypes: NULL, INTEGER, REAL, TEXT, BLOB */
  db.prepare(`CREATE TABLE IF NOT EXISTS '${tableName}' (
    'nick' TEXT PRIMARY KEY,
    'score' REAL,
    'updated' INTEGER
    )`).run()
}
catch(err) {
  clog.error(`Could not starting sqlite3 database for ${ident}`, err.message)
  db = undefined
}
/* updateScore("goos", 0.473) => undefined */
const updateScore=(a,b)=>{
  try{if(db){
    db.prepare(`INSERT OR REPLACE INTO '${tableName}' (nick, score, updated) VALUES (?, ?, ?)`).run(flatnick(a),b,unixtime());}
  }catch(err){
    clog.error("Error in updateScore", err.message)
    return undefined
  }}
/* i = getScore("goos") => {nick: "goos", score: 0.473, updated: 1752723556} */
const getScore=a=>{
  let b;
  try{if(db){
    b=db.prepare(`SELECT score,updated FROM '${tableName}' WHERE nick = ?`).get(flatnick(a));}
  }catch(err){
    clog.error("Error in getScore(${a})",err.message)
  }
  b||={score:0.5,updated:0}
  if(b.score===undefined || b.score===null) b.score=0.5 /* goddamn edgecase */
  return {nick:a,score:b.score,updated:b.updated}
  }

/* -- the commands from users -- */
var help = []
var lasttime = 0

/* .duel goos => "goos slapped Mozai with a large trout into unconciousness." */
shuffle(methods)
ipc.subscribe('duel.request', (data) => {
  const request = JSON.parse(data)
  if((Date.now() - lasttime) < throttle){
    /* return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify({target: request.nick, text: "Wait."})) */
  }
  lasttime = Date.now()
  if(!request.args){
    return ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify({target: request.channel, text: "No defender? no duel."}))
  }
  /* TODO: "but {defender} isn't here" */
  const aggressor = getScore(request.nick)
  const defender = getScore(request.args.split(' ')[0])
  /* and now the not-so-fair competition. Aggressor wants to roll low */
  let coinflip = 0.50
  /* if the aggressor dueled more recently, disadvantage */
  if(aggressor.updated > defender.updated) coinflip -= 0.1
  /* if it's someone's lucky day */
  const dow = (new Date()).getDay()
  if(dow == luckyday(aggressor.nick)) coinflip += 0.1
  if(dow == luckyday(defender.nick)) coinflip -= 0.1
  let winner = aggressor, loser = defender
  if(Math.random() >= coinflip)
    winner = defender, loser = aggressor
  /* a bit of noise so the ranks aren't identical over time */
  const wiggle = (0.5-Math.random())/1000
  /* ten-match exponential moving average */
  updateScore(winner.nick, ((1 - winner.score)*0.1)+winner.score+wiggle)
  updateScore(loser.nick, ((0 - loser.score)*0.1)+loser.score+wiggle)
  const reply = {target: request.channel, text: madlibs(choosefresh(methods), {"winner": winner.nick, "loser": loser.nick})}
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply))
})
help.push({ command: 'duel', descr: 'Pick a fight with someone',
   params: [
     {param: 'defender', required: true, descr: `The person you will challenge`}
   ] })

/* .duelrank goos => "goos has rank indigo; their last duel was some time ago." */
shuffle(ranks)
ipc.subscribe('duelrank.request', (data) => {
  const request = JSON.parse(data)
  const whomst = (request.args.split(' ')[0] || request.nick)
  /* TODO: more than one name as parameter; all will use same ranking_scheme */
  let reply = {target: request.channel, text: `${whomst} has no duel rank`}
  const le_score = getScore(whomst)
  if(le_score.updated > 0) {
    const ranking_scheme = choosefresh(ranks)
    if (le_score["score"] > 0.9999999999999999) le_score["score"] = 0.9999999999999999
    else if (le_score["score"] < 0.0) le_score["score"] = 0.0
    const rank = ranking_scheme[Math.floor((ranking_scheme.length)*le_score["score"])]
    const now = unixtime()
    let when = "; they haven't dueled in a long time"
    if((now-le_score.updated)<(86400*1)) when = "" /* one day */
    else if((now-le_score.updated)<(86400*10)) when = "; they fought recently" /* ten days */
    else if((now-le_score.updated)<(86400*30)) when = "; they fought not long ago" /* 30 days */
    else if((now-le_score.updated)<(86400*90)) when = "; their last duel was some time ago" /* 90 days */
    reply.text = `${whomst}'s rank is ${rank}${when}`
  }
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply))
})
help.push({ command: 'duelrank', descr: 'Get a vague idea of your awesomeness',
   params: [
     {param: 'who', required: false, descr: 'If not you, then whomst?'}
   ]
})

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
process.on("SIGINT",()=>{handleSIGINT(ident,ipc)})

