brobot
=====

brobot is a bot designed for the [Bass Music Room](http://plug.dj/bass-music-garage-dubstep-etc/) on plug.dj. Much of the framework was taken from Snarl, the bot for Coding Soundtrack but much of the code has also been rewritten.

# Requirements
The following things need to be installed in your environment to proceed.

node.js
MongoDB

# Instructions

Copy `config.js.example` to `config.js` and configure the values therein.  Most importantly, copy `auth` from the cookies of your bot account's plug.dj account.

Run `npm install` to install all the necessary packages.

Run `cd lib && git clone git://github.com/atomjack/simple-lastfm.git` to install `simple-lastfm`.

Run `node bot.js` to get the bot started. :)

# Warnings

Things WILL break if there is not a DJ playing a song at all times.
