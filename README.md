# eevee
yes another irc bot yes i'm rewriting it but keeping the same name
hush hush

## Requirements:
- `node` from NodeJS, version v18 "lts/hydrogen"
  - this is not the latest, you'll need `nvm` or (preferred) start a
    docker conatiner and mount-in this project directory
- npm, used to install dependent modules described in packages.json


## Setup
**TODO:** step-by-step instructions for using goos's prefered method:
docker containers

If using `nvm` (oh god they change the NVM instructions every four months;
good luck):

    # start in the eevee directory
    NVM_DIR=$HOME/.nvm
    . /usr/share/nvm/init-nvm.sh
    nvm install lts/hydrogen  # if not already installed
    nvm use lts/hydrogen
    npm install

Copy etc.example/ to etc/ and edit at least these files:
- etc/irc/${networkname}.hjson
- etc/global.hjson
- etc/init.hjson
  Remember either to set `initAllModules: true` or in `initModules`
  include "irc-connector.${networkname}" and "irc-parser.${networkname}"

Then `./eevee init` to launch.  It'll make some daemons (one for each
module) run in the background.


## Known problems
* If there's a problem in a module, it will hang on starting that module.
  Try looking in the files in the log/ subdir
* doesn't clear procPath on shutdown or kill, so
  you'll likely need to manually `rm -rf /tmp/eevee` after shutdown.
* try `node modules/your_thing.mjs` to get more verbose errors about
  startup

