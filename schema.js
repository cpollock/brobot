var mongoose = require('mongoose')
  , ObjectId = mongoose.Schema.Types.ObjectId
  , Schema = mongoose.Schema

module.exports = {
personSchema: mongoose.Schema({
        name: { type: String, index: true }
      , plugID: { type: String, unique: true, sparse: true }
      , role: { type: Number }
      , plays: { type: Number, default: 0 }
      , points: {
            listener: { type: Number, default: 0 }
          , curator: { type: Number, default: 0 }
          , dj: { type: Number, default: 0 }
          , man: { type: Number, default: 0 }
        }
      , lastChat: { type: Date }
      , bio: { type: String, max: 1024 }
      , avatar: {
            'set': String
          , 'key': String
          , 'uri': String
          , 'thumb': String
        }
    })

,songSchema:  mongoose.Schema({
      author: String
    , id: { type: String, index: true }
    , cid: String
    , plugID: String
    , format: String
    , title: String
    , duration: Number
    , lastPlay: Date
    , firstPlayHistory: {type: ObjectId, ref: 'History'}
})
,historySchema: mongoose.Schema({
    _song: { type: ObjectId, ref: 'Song', required: true }
  , _dj: { type: ObjectId, ref: 'Person', required: true }
  , timestamp: { type: Date }
  , curates: [ new Schema({
      _person: { type: ObjectId, ref: 'Person', required: true }
    }) ]
  , downvotes: { type: Number, default: 0 }
  , upvotes: { type: Number, default: 0 }
  , votes: [ {
        _person: { type: ObjectId, ref: 'Person', required: true }
      , vote: { type: String, enum: [1, -1] }
    } ]
})

,chatSchema: mongoose.Schema({
    timestamp: { type: Date, default: Date.now }
  , _person: { type: ObjectId, ref: 'Person', required: true }
  , message: { type: String, required: true }
})}

module.exports.personSchema.virtual('points.total').get(function () {
  return this.points.dj + this.points.curator + this.points.listener;
});

module.exports.historySchema.virtual('isoDate').get(function() {
  return this.timestamp.toISOString();
});

module.exports.chatSchema.virtual('isoDate').get(function() {
  return this.timestamp.toISOString();
});
