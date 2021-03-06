var rest = require('restler')
  , github = require('github')
  , timeago = require('timeago')
  , _ = require('underscore');



module.exports = {

   woot: function(data){ this.woot()}


   ,bio: function(data) {
      var self = this;
      if (typeof(data.params) != 'undefined' && data.params.trim().length > 0) {
        data.person.bio = data.params.trim();
        data.person.save(function(err) {
          self.chat('Bio saved!  Profile link: '+ root + 'djs/' + data.fromID );
        });
      } else {
        if (typeof(data.person.bio) != 'undefined' && data.person.bio.length > 0) {
          self.chat('You must provide a string for your bio.  Markdown is accepted.  Your current bio is: “'+data.person.bio+'”');
        } else {
          self.chat('You must provide a string for your bio.  Markdown is accepted.');
        }
        
      }
    }
    //broken
  , catfacts: function(data) {
      var self = this;
      rest.get('http://catfacts-api.appspot.com/api/facts').on('complete', function(response) {
        response = JSON.parse(response);
        if (response.facts && response.facts.length > 0) {
          self.chat(response.facts[0]);
        }
      });
    }

  , boss: function(data) {
      var self = this;
      self.chat('The best play of all time was... @' + self.records.boss._dj.name + ' with ' + self.records.boss.curates.length + ' snags of their play of ' + self.records.boss._song.title + ' on ' + self.records.boss.timestamp + '!  More: ' + root + 'history/' + self.records.boss._id );
    }

  , permalink: function(data) {
      var self = this;
      self.chat('Song: ' + root + 'songs/' + self.room.track.id );
    }

  , profile: function(data) {
      var self = this;
      if (typeof(data.params) != 'undefined' && data.params.trim().length > 0) {
        Person.findOne({ name: data.params }).exec(function(err, person) {
          if (!person) {
            self.chat('/me could not find a profile by that name.');
          } else {
            self.chat('@' + data.params + ': “'+person.bio+'”  More: ' + root + 'djs/'+ person.plugID)
          }
        });
      } else {
        self.chat('Whose profile did you want?');
      }
    }
  , songtitle: function(data) {
      var self = this;

      var staffMap = [];
      _.toArray(self.room.staff).forEach(function(staffMember) {
        if ( self.room.staff[staffMember.plugID].role >= 1 ) {
          staffMap.push(staffMember.plugID);
        }
      });

      if (staffMap.indexOf( data.fromID ) == -1) {
        self.chat('I\'ll take that into consideration.  Maybe.');
      } else {
        Song.findOne({ id: self.currentSong.id }).exec(function(err, song) {
          if (err) { console.log(err); } else {
            if (data.params.length > 0) {
              var previousTitle = song.title;
              song.title = data.params;

              song.save(function(err) {
                self.chat('Song title updated, from "'+previousTitle+ '" to "'+song.title+'".  Link: ' + root + 'songs/' + self.room.track.id );
              });
            } else {
              self.chat('What do you want to set the title of this song to?  I need a parameter.');
            }
          }
        });
      }
    }
  , songartist: function(data) {
      var self = this;

      var staffMap = [];
      _.toArray(self.room.staff).forEach(function(staffMember) {
        if ( self.room.staff[staffMember.plugID].role >= 1 ) {
          staffMap.push(staffMember.plugID);
        }
      });

      if (staffMap.indexOf( data.fromID ) == -1) {
        self.chat('I\'ll take that into consideration.  Maybe.');
      } else {
        Song.findOne({ id: self.currentSong.id }).exec(function(err, song) {
          if (err) { console.log(err); } else {
            if (data.params.length > 0) {
              var previousAuthor = song.author;
              song.author = data.params;

              song.save(function(err) {
                self.chat('Song artist updated, from "'+previousAuthor+ '" to "'+song.author+'".  Link: ' + root + 'songs/' + self.room.track.id );
              });
            } else {
              self.chat('What do you want to set the author of this song to?  I need a parameter.');
            }
          }
        });
      }
    }
  , songplays: function(data) {
      var self = this;
      console.log('looking up: ' + JSON.stringify(self.currentSong));
      
      Song.findOne({ id: self.currentSong.id }).exec(function(err, song) {
        if (err) { console.log(err); } else {
          History.count({ _song: song._id }, function(err, count) {
            self.chat('This song has been played ' + count + ' times in recorded history.');
          });
        }
      });
    }
  , lastplayed: function(data) {
      var self = this;
      History.find({ _song: self.room.track._id }).sort('-timestamp').limit(2).populate('_dj').exec(function(err, history) {
        var lastPlay = history[1];

        if (lastPlay) {
          History.count({ _song: self.room.track._id }).exec(function(err, count) {
            self.chat('This song was last played ' + timeago(lastPlay.timestamp) + ' by @' + lastPlay._dj.name + '.  It\'s been played ' + count + ' times in total.  More: ' + root + 'songs/' + self.room.track.id );
          });
        } else {
          self.chat('I haven\'t heard this song before now.');
        }

      });
    }
  , firstplayed: function(data) {
      var self = this;
      if (typeof(self.room.track._id) != 'undefined') {
        History.findOne({ _song: self.room.track._id }).sort('+timestamp').populate('_dj').exec(function(err, firstPlay) {
          History.count({ _song: self.room.track._id }).exec(function(err, count) {
            self.chat('@' + firstPlay._dj.name + ' was the first person to play this song!  Since then, it\'s been played ' + count + ' times.  More: ' + root + 'songs/' + self.room.track.id );
          });
        });
      } else {
        self.chat('Hold on, I\'m still booting up.  Gimme a minute.');
      }
    }

  , history: function(data) {
      var self = this;
      History.count({}, function(err, count) {
        self.chat('There are ' + count + ' songs in recorded history: ' + root + 'history');
      });
    }

  , trout: function(data) {
      var target = data.from;

      if (typeof(data.params) != 'undefined' && data.params.trim().length > 0) {
        target = data.params.trim();
      }

      this.chat('/me slaps ' + target + ' around a bit with a large trout.');
    }

  , brew: function(data) {
      var self = this;

      if (typeof(data.params) != 'undefined') {
        rest.get('http://api.brewerydb.com/v2/search?q=' + data.params + '&key=7c05e35f30f5fbb823ec4731735eb2eb').on('complete', function(api) {
          if (typeof(api.data) != 'undefined' && api.data.length > 0) {
            if (typeof(api.data[0].description) != 'undefined') {
              self.chat(api.data[0].name + ': ' + api.data[0].description);
            } else {
              self.chat(api.data[0].name + ' is a good beer, but I don\'t have a good way to describe it.');
            }
            
          } else {
            self.chat('Damn, I\'ve never heard of that.  Where do I need to go to find it?');
          }
        });
      } else {
        self.chat('No query provided.');
      }

    }

  , debug: function(data) { this.chat(JSON.stringify(data)) }
}

function oxfordJoin(array) {
  if (array instanceof Array) {

  } else {
    array = _.toArray(array).map(function(item) {
      return item.name;
    });
  }

  var string = '';
  if (array.length <= 1) {
    string = array.join();
  } else {
    string = array.slice(0, -1).join(", ") + ", and " + array[array.length-1];
  }
  return string;
}

function secondsToTime(secs) {
  var hours = Math.floor(secs / (60 * 60));
  
  var divisor_for_minutes = secs % (60 * 60);
  var minutes = Math.floor(divisor_for_minutes / 60);

  var divisor_for_seconds = divisor_for_minutes % 60;
  var seconds = Math.ceil(divisor_for_seconds);
  
  var obj = {
    "h": hours,
    "m": minutes,
    "s": seconds
  };
  return obj;
}

function randomFact(type) {
  var ar = facts[type];
  return ar[Math.round(Math.random()*(ar.length-1))];
}

function getRandomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


function str_split(string, split_length) {
  // http://kevin.vanzonneveld.net
  // +     original by: Martijn Wieringa
  // +     improved by: Brett Zamir (http://brett-zamir.me)
  // +     bugfixed by: Onno Marsman
  // +      revised by: Theriault
  // +        input by: Bjorn Roesbeke (http://www.bjornroesbeke.be/)
  // +      revised by: Rafał Kukawski (http://blog.kukawski.pl/)
  // *       example 1: str_split('Hello Friend', 3);
  // *       returns 1: ['Hel', 'lo ', 'Fri', 'end']
  if (split_length === null) {
    split_length = 1;
  }
  if (string === null || split_length < 1) {
    return false;
  }
  string += '';
  var chunks = [],
    pos = 0,
    len = string.length;
  while (pos < len) {
    chunks.push(string.slice(pos, pos += split_length));
  }

  return chunks;
};

