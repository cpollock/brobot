var config = require('./config')
  , fs =  require('fs')
  , PlugAPI = require('plugapi')
  , repl = require('repl')
  , _ = require('underscore')
  , LastFM = require('./lib/simple-lastfm')
  , async = require('async')
  , rest = require('restler')
  , express = require('express')
  , $ = require('jquery')
  , app = express()
  , mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , schema = require('./schema')
  , ObjectId = mongoose.Schema.Types.ObjectId
// Set database path, botname, room depending on environment
var mongo;
app.configure('development', function(){
    mongo = {
        "hostname":"localhost",
        "port":27017,
        "username":"",
        "password":"",
        "name":"",
        "db":"db"
    }
    config.auth = config.testAccount || config.auth
    config.botname = "testbot"
    config.room  = config.testRoom || config.room
    root = 'localhost:43001/'
});

app.configure('production', function(){
    var env = JSON.parse(process.env.VCAP_SERVICES);
    mongo = env['mongodb-1.8'][0]['credentials'];
    root = 'http://bassroomstats.eu01.aws.af.cm/'
});

var generate_mongo_url = function(obj){
    obj.hostname = (obj.hostname || 'localhost');
    obj.port = (obj.port || 27017);
    obj.db = (obj.db || 'snarl');
    if(obj.username && obj.password){
        return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }
    else{
        return "mongodb://" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }
}


//Configure Bot
var db = mongoose.connect(generate_mongo_url(mongo))


// Gets array that points to all different versions of avatars
var avatarManifest = {};
rest.get('http://plug.dj/_/static/js/avatars.4316486f.js').on('complete', function(data) {
  // TODO: bug @Boycey to provide an endpoint for this.
  eval(data);  // oh christ. this is bad. 
  avatarManifest = AvatarManifest; 
});

Person  = db.model('Person',  schema.personSchema);
Song    = db.model('Song',    schema.songSchema);
History = db.model('History', schema.historySchema);
Chat    = db.model('Chat',    schema.chatSchema);
var messages = require('./messages')

app.use(express.bodyParser());
app.use(function(req, res, next) {
  res.setHeader("X-Powered-By", 'speed.');
  next();
});
app.use(app.router);
app.use(express.static(__dirname + '/public'));
app.use(express.errorHandler());
app.set('view engine', 'jade');
app.locals.config = config; // WARNING: this exposes your config to jade! be careful not to render your bot's cookie.
app.locals.pretty = true;
app.locals.wideformat = false;
app.locals.moment = require('moment');

History.find().limit(1).populate('_song').exec(function(err, oldestHistory) {
  app.locals.oldestPlay = oldestHistory[0];
});


// takes a plug.dj user id and then runs a call back with the user's object as an argument
function findOrCreatePerson(user, callback) {
  Person.findOne({ plugID: user.plugID }).exec(function(err, person) {

    if (!person) {
      var person = new Person({
          name: user.name
        , plugID: user.plugID
        , lastChat: new Date()
      });
    }

    if (typeof(user.name) != 'undefined') {
      person.name = user.name;
    }

    if (typeof(user.avatarID) != 'undefined') {
      person.avatar = {
          key: user.avatarID
        , thumb: 'http://plug.dj' + avatarManifest.getThumbUrl(user.avatarID)
      }
    }

    if (typeof(user.points) != 'undefined') {
      if (typeof(user.points.dj) != 'undefined') {
        person.points.dj = user.points.dj;
      }
      if (typeof(user.points.curator) != 'undefined') {
        person.points.curator = user.points.curator;
      }
      if (typeof(user.points.listener) != 'undefined') {
        person.points.listener = user.points.listener;
      }
    }

    if (typeof(user.role) != 'undefined') {
      person.role = user.role;
    }

    person.save(function(err) {
      	callback(person);
    });
  });
}

app.get('/search/name/:name', function(req, res) {
  Person.findOne({ name: req.param('name') }).exec(function(err, person) {
    if (!person) {
      res.send('No such DJ found!');
    } else {
      if (typeof(person.plugID) != 'undefined') {
        res.redirect('/djs/' + person.plugID);
      } else {
        res.send('DJ located, but no known plug.dj ID.');
      }
    }
  })
});

app.get('/chat', function(req, res) {
  Chat.find().sort('-timestamp').limit(50).populate('_person').exec(function(err, chats) {
    res.render('chats', {
      chats: chats
    });
  });
});

// Search endpoint
app.post('/chat', function(req, res) {
  Chat.find({ message: new RegExp('(.*)'+req.param('q')+'(.*)', 'i') }).sort('-timestamp').limit(50).populate('_person').exec(function(err, chats) {
    res.render('chats', {
        chats: chats
    });
  });
});


app.get('/commands', function(req, res) {
  res.render('commands', {
    commands: Object.keys(messages)
  });
});

app.get('/history', function(req, res) {
  History.find().sort('-timestamp').limit(1000).populate('_song').exec(function(err,  history) {
    res.render('history', {
      history: history
    });
  });
});

app.get('/history/:songInstance', function(req, res) {
  History.findOne({ _id: req.param('songInstance') }).populate('_song').populate('_dj').populate('curates._person').exec(function(err, songInstance) {

    res.render('song-instance', {
      song: songInstance
    });
  })
});

app.get('/songs', function(req, res) {
  var today = new Date();

  mostPopularSongsAlltime(function(allTime) {

    // one month
    var time = new Date();
    time.setDate( today.getDate() - 30 );

    mostPopularSongsSince(time, function(month) {
      // one week
      var time = new Date();
      time.setDate( today.getDate() - 7 );

      mostPopularSongsSince(time, function(week) {
        res.render('songs', {
            allTime: allTime
          , month: month
          , week: week
        });
      });
    });
  });
});

// Returns top 25 songs with ordered by curates
// Refactor this into a higher order function surely..
app.get('/stats/plays', function(req, res) {

  var map = function() { //map function
    if (typeof(this.curates) == 'undefined') {
      emit(this._id, 0);
    } else {
      emit(this._id, this.curates.length);
    }
  } 

  var reduce = function(previous, current) { //reduce function
    var count = 0;
    for (index in current) {  //in this example, 'current' will only have 1 index and the 'value' is 1
      count += current[index]; //increments the counter by the 'value' of 1
    }
    return count;
  };

  /* execute map reduce */
  History.mapReduce({
      map: map
    , reduce: reduce
  }, function(err, plays) {

    if (err) {
      console.log(err);
    }
	if (plays == undefined){plays = []}

    /* sort the results */
    plays.sort(function(a, b) {
      return b.value - a.value;
    });

    /* clip the top 25 */
    plays = plays.slice(0, 25);

    /* now get the real records for these songs */
    async.parallel(plays.map(function(play) {
      return function(callback) {
        History.findOne({ _id: play._id }).populate('_song').exec(function(err, realPlay) {
          if (err) { console.log(err); }

          realPlay.curates = play.value;

          callback(null, realPlay);
        });
      };
    }), function(err, results) {

      /* resort since we're in parallel */
      results.sort(function(a, b) {
        return b.curates - a.curates;
      });

      res.send(results);
    });

  });
})

app.get('/songs/:songID', function(req, res, next) {
  Song.findOne({ id: req.param('songID') }).exec(function(err, song) {
    if (song) {
      song._song = song; // hack to simplify templates for now (mp: AKA this will never get fixed. this is the History schema, technically
      History.count({ _song: song._id }, function(err, playCount) {
        song.playCount = playCount;

        History.find({ _song: song._id }).populate('_dj').exec(function(err, songPlays) {

          song.firstPlay = songPlays[0];
          song.mostRecently = songPlays[ songPlays.length - 1 ];

          var songDJs = {};

          songPlays.forEach(function(play) {
            songDJs[play._dj.plugID] = play._dj;
          });
          songPlays.forEach(function(play) {
            if (typeof(songDJs[play._dj.plugID].songPlays) != 'undefined') {
              songDJs[play._dj.plugID].songPlays = songDJs[play._dj.plugID].songPlays + 1;
            } else {
              songDJs[play._dj.plugID].songPlays = 1;
            }
          });

          songDJs = _.toArray(songDJs);
          songDJs.sort(function(a, b) {
            return b.songPlays - a.songPlays;
          });

          res.render('song', {
              song: song
            , songDJs: songDJs
          });

        });
      });
    } else {
      next();
    }
  });
});

app.get('/djs', function(req, res) {
    // one month
    var time = new Date();
    time.setDate( time.getDate() - 30 );

    mostProlificDJs(time, function(monthlyDJs) {
      Person.find().sort('-points.dj').limit(10).exec(function(err, mostPoints) {
        res.render('djs', {
           monthlyDJs: monthlyDJs
          , mostPoints: mostPoints
        });
      });
    });
});



app.get('/djs/:plugID', function(req, res, next) {
  Person.findOne({ plugID: req.param('plugID') }).exec(function(err, dj) {
    if (dj) {
      History.find({ _dj: dj._id }).sort('-timestamp').limit(10).populate('_song').exec(function(err, djHistory) {
        dj.playHistory = djHistory;

        if (typeof(dj.bio) == 'undefined') {
          dj.bio = '';
        }

        History.count({ _dj: dj._id }).exec(function(err, playCount) {
          res.render('dj', {
              md: require('node-markdown').Markdown
            , dj: dj
            , avatarImage: 'http://plug.dj' + avatarManifest.getAvatarUrl('default', dj.avatar.key, '')
            , playCount: playCount
          });
        });

      });
    } else {
      next();
    }
  });
});


app.get('/', function(req, res) {
  History.find().sort('-timestamp').limit(5).populate('_song').populate('_dj').exec(function(err, history) {

      //This feels wrong
      var calls = []
      var counts = []
      var firstPlay = []
      history.forEach(function(name){
        calls.push(function(callback){
          History.count({ _song: name._song._id }, function(err, playCount) {
            counts.push(playCount)
            History.findOne({_id:name._song.firstPlayHistory}, function(err, history){
              firstPlay.push(history)
              callback(null, name)
            })
          })
        })})
        async.parallel(calls, function(err, result){
        console.log('after')
        history = _.zip(counts,history, firstPlay)
        res.render('index', {
          currentSong: bot.currentSong
        , history: history
        , room: bot.room
        , wideformat: true
      })
      })


  });
});


app.get('/audience', function(req, res) {
  res.send(bot.room.audience);
});

app.listen(process.env.VCAP_APP_PORT || 43001);


// Returns top 10 DJs with most plays after a certain time
function mostProlificDJs(time, callback) {

  /* execute map reduce */
  History.mapReduce({
      map: mapDJ
    , reduce: reduce
    , query: { timestamp: { $gte: time } }
  }, function(err, songs) {
	if (songs == undefined){ songs = []}
    /* sort the results */
    songs.sort(function(a, b) {
      return b.value - a.value;
    });

    /* clip the top 10 */
    songs = songs.slice(0, 10);

    /* now get the real records for these DJs */
    async.parallel(songs.map(function(song) {
      return function(callback) {
        Person.findOne({ _id: song._id }).exec(function(err, realSong) {
          realSong.plays = song.value;
          callback(null, realSong);
        });
      };
    }), function(err, results) {

      /* resort since we're in parallel */
      results.sort(function(a, b) {
        return b.plays - a.plays;
      });

      callback(results);

    });
  });
}


var map = function() { //map function
  emit(this._song, 1); //sends the url 'key' and a 'value' of 1 to the reduce function
} 

var mapDJ = function() { //map function
  emit(this._dj, 1); //sends the url 'key' and a 'value' of 1 to the reduce function
} 

var reduce = function(previous, current) { //reduce function
  var count = 0;
  for (index in current) {  //in this example, 'current' will only have 1 index and the 'value' is 1
    count += current[index]; //increments the counter by the 'value' of 1
  }
  return count;
};

function mostPopularSongs(query, n, callback){
  /* execute map reduce */
  History.mapReduce({
      map: map
    , reduce: reduce
    , query: query
  }, function(err, songs) {
	if (songs == undefined){songs = []}
    /* sort the results */
    songs.sort(function(a, b) {
      return b.value - a.value;
    });

    /* clip the top n */
    songs = songs.slice(0, n);

    /* now get the real records for these songs */
    async.parallel(songs.map(function(song) {
      return function(callback) {
        Song.findOne({ _id: song._id }).exec(function(err, realSong) {
          realSong.plays = song.value;
          callback(null, realSong);
        });
      };
    }), function(err, results) {

      /* resort since we're in parallel */
      results.sort(function(a, b) {
        return b.plays - a.plays;
      });

      callback(results);

    });
  });
}

// Returns 100 songs with most plays
// I think this should be a better metric?
function mostPopularSongsAlltime(callback) {
  mostPopularSongs({},100,callback)
}


// Returns most popular song between two dates
function mostPopularSongsBetween(start, end, callback) {
  mostPopularSongs({ timestamp: { $gte: start, $lte: end } }, 25, callback)
}

// Returns most played song since a date
function mostPopularSongsSince(time, callback) {
  mostPopularSongs({ timestamp: { $gte: time } }, 25, callback)
}



var AUTH = config.auth; 
var ROOM = config.room;
var timeout;

var bot = new PlugAPI(AUTH);
bot.currentSong = {};
bot.currentRoom = {};
bot.room = {
    djs: {}
  , track: {}
  , audience: {}
  , currentPlay: {}
  , currentDJ: {}
  , staff: {}
};
bot.records = {
  boss: {}
};
bot.connect();

// On connect to room
// Needs rewriting
bot.on('connected', function() {
  bot.joinRoom(config.room, function(data) {
    console.log(JSON.stringify(data));
    var now = new Date();
    bot.updateDJs(data.room.djs, function() {
      for (var dj in bot.room.djs) {
        bot.room.djs[dj].onDeckTime = new Date();
        bot.room.djs[dj].onDeckTimeISO = bot.room.djs[dj].onDeckTime.toISOString();
      }
    });
    console.log(data.room.currentDJ)
    findOrCreatePerson(data.room.currentDJ, function(person){dj = person})
    bot.currentSong       = data.room.media;
    // deals with reconnects maintaining history
    Song.findOne({ id: data.room.media.id }).exec(function(err, song) {
      console.log(song)
      bot.room.track  = song;
      
      if (song != null){
	      var b = new Date(now - (song.duration*1000))
      	History.findOne({_song: bot.room.track._id, timestamp: {$gte: b}}).exec(function(err,hist){
		      console.log(hist)
		      bot.room.currentPlay = hist
    	  })
	    }
      else{
	      var song = new Song(data.room.media);
	      song.lastPlay = now
	      song.save()
	      console.log(song)
	      var history = new History({
            _song: song._id
          , _dj: dj._id
          , timestamp: now
          });
	      history.save()
	      bot.room.currentPlay = history
      }
	
    });


    bot.getBoss(function(boss) {
      bot.records.boss = boss;
    });
    
    

    for (var plugID in data.room.staff) {
      findOrCreatePerson({
          plugID: plugID
        , role: data.room.staff[plugID]
      }, function(person) {
        bot.room.staff[person.plugID] = person;
      });
    }

    data.room.users.forEach(function(user) {
      bot.observeUser(user, function(person) {
        });
    });

    findOrCreatePerson({
      plugID: data.currentDJ
    }, function(dj) {
      bot.room.currentDJ    = dj;
    });

  });
})


bot.on('curateUpdate', function(data) {
  console.log('CURATEUPDATE:');
  console.log(data);

  bot.observeUser(data, function(person) {

    console.log(person.name + ' just added this song to their playlist.');

    if (typeof(bot.room.currentPlay) != 'undefined' && typeof(bot.room.currentPlay.curates) != 'undefined') {
      bot.room.currentPlay.curates.push({
        _person: person._id
      });

      bot.room.currentPlay.save(function(err) {
        if (err) { console.log(err); }
      });
    }
  });
});

bot.on('voteUpdate', function(data) {
  console.log('VOTEUPDATE:');
  console.log(data);

  findOrCreatePerson({
    plugID: data.id
  }, function(person) {
    bot.room.audience[data.id] = person;


    // Don't know what this is meant to acheive but bot.currentSong is a plugDJ media object
    switch (data.vote) {
      case 1:
        bot.currentSong.upvotes++;
      break;
      case -1:
        bot.currentSong.downvotes++;
      break;
    }
    bot.observeUser(data, function(person){
	  // updates votes tally
    	if (typeof(bot.room.currentPlay) != 'undefined') {
      		var vs = bot.room.currentPlay.votes
      		vs = vs.filter(function(e,i,a){return (e._person.toString() != person._id.toString())})
      		vs.push({ _person: person._id, vote: data.vote})
      		bot.room.currentPlay.votes = vs
		      bot.room.currentPlay.save()
    }})

  });
});

bot.on('userLeave', function(data) {
  console.log('USERLEAVE EVENT:');
  console.log(data);

  delete bot.room.audience[data.id];
});

bot.on('userJoin', function(data) {
  console.log('USERJOIN EVENT:');
  console.log(data);

  bot.observeUser(data);
});

bot.on('userUpdate', function(data) {
  console.log('USER UPDATE:');
  console.log(data);

  bot.observeUser(data);
});

bot.on('djUpdate', function(data) {
  console.log('DJ UPDATE EVENT:');
  //console.log(data);

  var currentDJs = [];
  for (var dj in bot.room.djs) {
    currentDJs.push(bot.room.djs[dj].plugID.toString());
  }

  var newDJs = data.map(function(dj) {
    return dj.user.id;
  });

  console.log('OLD DJs: ' + currentDJs);
  console.log('NEW DJs: ' + newDJs);


  currentDJs.forEach(function(plugID) {
    if (newDJs.indexOf(plugID) == -1) {
      delete bot.room.djs[ plugID ]; // remove from known DJs.
    }
  });

  var djsAddedThisTime = [];
  async.series(data.map(function(dj) {
    return function(callback) {
      console.log('DJ: ' + dj.user.id + ' ...');
      findOrCreatePerson({
        plugID: dj.user.id
      }, function(person) {

        console.log(currentDJs.indexOf(person.plugID.toString()));
        if (currentDJs.indexOf(person.plugID.toString()) == -1) {
          console.log('NEW DJ FOUND!!! ' + person.name);

          djsAddedThisTime.push( dj.user.id );

          History.count({ _dj: person._id }).exec(function(err, playCount) {
            console.log('They have played ' + playCount + ' songs in this room before.');
            if (playCount == 0) {
              console.log(person.name + ' has never played any songs here before!');
  
            }

            callback(null, person);
          });
        }

      });
    };
  }), function(err, results) {

    bot.updateDJs(data, function() {
      djsAddedThisTime.forEach(function(dj) {
        bot.room.djs[ dj ].onDeckTime     = new Date();
        bot.room.djs[ dj ].onDeckTimeISO  = bot.room.djs[ dj ].onDeckTime.toISOString();
      });
    });

  });

});

// This is a mess
bot.on('djAdvance', function(data) {
  var self = this;

  console.log('New song: ' + JSON.stringify(data));

  try {
    lastfm.getSessionKey(function(result) {
      console.log("session key = " + result.session_key);
      if (result.success) {
        lastfm.scrobbleNowPlayingTrack({
            artist: data.media.author
          , track: data.media.title
          , callback: function(result) {
              console.log("in callback, finished: ", result);
            }
        });

        var scrobbleDuration = 60000;
        if (data.media.duration > 120000) {
          scrobbleDuration = 240000;
        } else {
          scrobbleDuration = data.media.duration * 1000 / 2;
        }

        bot.room.track.scrobbleTimer = setTimeout(function() {
          lastfm.scrobbleTrack({
              artist: data.media.author,
              track: data.media.title,
              callback: function(result) {
                  console.log("in callback, finished: ", result);
              }
          });
        //}, scrobbleDuration);
        }, 5000); // scrobble after 30 seconds, no matter what.

      } else {
        console.log("Error: " + result.error);
      }
    });
  } catch (err) {
    console.log('lastfm scrobble failed')
  }

  // deal with plug.djs's failure to serve disconnection events
  // by expecting the next djAdvance event based on the time of the 
  // current media.
  clearTimeout(timeout);
  timeout = setTimeout(function() {
    console.log('PLUG.DJ FAILED TO SEND DJADVANCE EVENT IN EXPECTED TIMEFRAME.');
    //reconnect();
    bot.joinRoom('test', function() {
      bot.joinRoom(config.room);
    });
  }, (data.media.duration + 10) * 1000);

  bot.updateDJs(data.djs);
  bot.currentSong = data.media;

  Song.findOne({ id: data.media.id }).exec(function(err, song) {
    if (!song) {
      var song = new Song(data.media);
    }
    
    var now = new Date();

    song.lastPlay = now;

    song.save(function(err) {

      bot.room.track = song;
      // ??
      bot.currentSongMongoose = song;

      findOrCreatePerson({
        plugID: data.currentDJ
      }, function(dj) {

        var history = new History({
            _song: song._id
          , _dj: dj._id
          , timestamp: now
        });
        history.save(function(err) {
          // hack to makein-memory record look work
          bot.room.currentDJ    = dj;
          bot.room.currentPlay  = history;
          if (!song.firstPlayHistory){
            History.find({ _song: song._id }).populate('_dj').exec(function(err, songPlays) {
              if (songPlays){
                song.firstPlayHistory = songPlays[0];
                song.save()
              }
              else{ song.firstPlayHistory = history; song.save()}
              })
          
          }})
      })

    });

  });
});


bot.on('chat', function(data) {
  var self = this;
  var now = new Date();

  if (data.type == 'emote') {
    console.log(data.from+data.message);
  } else {
    console.log(data.from+"> "+data.message);
  }

  findOrCreatePerson({
      name: data.from
    , plugID: data.fromID
  }, function(person) {
    person.lastChat = now;
    person.save(function(err) {
      var chat = new Chat({
          message: data.message
        , _person: person._id
      });
      chat.save(function(err) {
        if (err) { console.log(err); }
      });
    });

    data.person = person;

    if (typeof(bot.room.djs[data.fromID]) != 'undefined') {
      bot.room.djs[data.fromID].lastChat = now;
    }


    var cmd = data.message;
    var tokens = cmd.split(" ");

    var parsedCommands = [];
    console.log(tokens)
    tokens.forEach(function(token) {
      if (token.substr(0, 1) === (config.commandPrefix || '!') && data.from != (config.botName || 'snarl') && parsedCommands.indexOf(token.substr(1)) == -1) {
        data.trigger = token.substr(1).toLowerCase();
        parsedCommands.push(data.trigger);

 
        // if this is the very first token, it's a command and we need to grab the params.
        if (tokens.indexOf(token) === 0) {
          data.params = tokens.slice(1).join(' ');
        }
          // Errr dirty type cohesion..
          switch (typeof(messages[data.trigger])) {
            case 'string':
              bot.chat(messages[data.trigger]);
            break;
            case 'function':
              messages[data.trigger].apply(bot, [ data ]);
            break;
          }

   
      }
    });
  });

});

// Boss defined as most curated track
PlugAPI.prototype.getBoss = function(callback) {
  var self = this;
  var map = function() { //map function
    if (typeof(this.curates) == 'undefined') {
      emit(this._id, 0);
    } else {
      emit(this._id, this.curates.length);
    }
  }

  var reduce = function(previous, current) { //reduce function
    var count = 0;
    for (index in current) {  //in this example, 'current' will only have 1 index and the 'value' is 1
      count += current[index]; //increments the counter by the 'value' of 1
    }
    return count;
  };

  /* execute map reduce */
  History.mapReduce({
      map: map
    , reduce: reduce
  }, function(err, plays) {

    if (err) {
      console.log(err);
    }
	if (plays == undefined){plays = []}
    /* sort the results */
    plays.sort(function(a, b) {
      return b.value - a.value;
    });

    /* clip the top 1 */
    plays = plays.slice(0, 1);

    /* now get the real records for these songs */
    async.parallel(plays.map(function(play) {
      return function(innerCallback) {
        History.findOne({ _id: play._id }).populate('_song').populate('_dj').exec(function(err, realPlay) {
          if (err) { console.log(err); }

          realPlay.curates = play.value;

          innerCallback(null, realPlay);
        });
      };
    }), function(err, results) {

      /* resort since we're in parallel */
      results.sort(function(a, b) {
        return b.curates - a.curates;
      });

      callback(results[0]);

    });

  });
};

// Keeps track of who is in the room
PlugAPI.prototype.observeUser = function(user, callback) {
  if (typeof(callback) == 'undefined') {
    callback = function (person) {};
  }

  findOrCreatePerson({
      plugID: user.id
    , name: user.username
    , avatarID: user.avatarID
    , points: {
          listener: user.listenerPoints
        , curator: user.curatorPoints
        , dj: user.djPoints
      }
  }, function(person) {
    bot.room.audience[user.id] = person;
    callback(person);
  });
}

PlugAPI.prototype.updateDJs = function(djs, callback) {
  var bot = this;
  //bot.room.djs = {};

  async.parallel(djs.map(function(dj) {
    return function(innerCallback) {
      findOrCreatePerson({
          plugID: dj.user.id
        , name: dj.user.username
        , avatarID: dj.user.avatarID
        , points: {
              listener: dj.user.listenerPoints
            , curator: dj.user.curatorPoints
            , dj: dj.user.djPoints
          }
      }, function(person) {

        person.onDeckTime     = (typeof(bot.room.djs[dj.user.id]) != 'undefined') ? bot.room.djs[dj.user.id].onDeckTime : new Date();
        person.onDeckTimeISO  = person.onDeckTime.toISOString();

        bot.room.djs[dj.user.id]      = person;
        bot.room.audience[dj.user.id] = person;

        /* Add values that we don't keep permanently (in the database),
           but want to use later. */
        bot.room.djs[ dj.user.id].plays = dj.plays;

        innerCallback(null, dj);

      });
    }
  }), function(err, results) {
    if (typeof(callback) == 'function') {
      callback();
    }
  });

};


var _reconnect = function() { bot.connect(config.room); };
var reconnect = function() { setTimeout(_reconnect, 500); };
bot.on('close', reconnect);
bot.on('error', reconnect);

r = repl.start("node> ");
r.context.bot = bot;
