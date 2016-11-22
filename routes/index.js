var express = require('express');
var router = express.Router();
var Twitter = require('twitter');
var AWS = require('aws-sdk');
AWS.config.update({region:'us-west-2'});
var elasticsearch = require('elasticsearch');

var returnRouter = function(io) {
/* GET home page. */
router.get('/', function(req, res, next) {
  var client = new elasticsearch.Client({
		  host: 'http://search-sentimenttweetsearch-ucm7t3h5bq6qiyjklppu22xrhy.us-west-2.es.amazonaws.com/'
		});
		client.search({
		  	index: 'tweets',
		  	q: '*:*',
		  	size:10000
		}).then(function (body) {
			tweets=body;
		  	res.render('index',{tweets:body});
		}, function (error) {
		  	console.trace(error.message);
		});
});

router.get('/key', function(req, res) {
	var client = new elasticsearch.Client({
		  host: 'http://search-sentimenttweetsearch-ucm7t3h5bq6qiyjklppu22xrhy.us-west-2.es.amazonaws.com/'
		});
	var key=req.param('key');
		if(key=='All'){
			
		  	client.search({
		  	index: 'tweets',
		  	q: '*:*',
		  	size:10000
		}).then(function (body) {
			tweets=body;
		  	res.send({tweets:body});
		}, function (error) {
		  	console.trace(error.message);
		});

		}
		else{
			client.search({
		  	index: 'tweets',
		  	q: key,
		  	size:10000
		}).then(function (body) {
			tweets=body;
		  	res.send({tweets:body});
		}, function (error) {
		  	console.trace(error.message);
		});

		}
		

	
});

var t = new Twitter({
	    consumer_key: 'CVS0Qnhxs7GvPXSvGFYJVHYhw',
	    consumer_secret: 'kthNyBSfxyH98uWZ95tcnhUubNHflexSJ3M2O3Xn1PYTv0rI38',
	    access_token_key: '510259968-zCXxpaJNk3s3F0jmbAkYq4H4CXqlbIegq1bkdVro',
	    access_token_secret: 'DzkkVvl6BE7fMwmN4HwFJSM7yq4DFdkv7FkoGRTlrXIgB'
	  });
var stream = t.stream('statuses/sample');

stream.on('data', function(data) {
	if(data.hasOwnProperty('created_at') && data['lang'] == "en" && data['coordinates'] != null){
		var tweet={
			id:data['id_str'],
			text:data['text'],
			user:data['user'],
			created_at:data['created_at'],
			coordinates:{
				lat:data["coordinates"]["coordinates"][1],
				lng:data["coordinates"]["coordinates"][0]
			}
		}
		var snsPublish = require('aws-sns-publish');
 		snsPublish(tweet, {arn: 'arn:aws:sns:us-west-2:012274775406:Processed_tweet'}).then(messageId => {
    		console.log(messageId);
		});
	}

});

var Consumer = require('sqs-consumer');
 
var consume_new_tweet=Consumer.create({
  queueUrl: 'https://sqs.us-west-2.amazonaws.com/012274775406/new_tweet',
  handleMessage: function (message, done) {
  	var new_tweet=JSON.parse(JSON.parse(message['Body'])['Message']);
  	var MonkeyLearn = require('monkeylearn');
	var ml = new MonkeyLearn('59fd105a2a06602b10f3132c4d0a073ee13d727f');
	var module_id = 'cl_qkjxv9Ly';
	var text_list = [new_tweet.text];
	var p = ml.classifiers.classify(module_id, text_list, true);
	p.then(function (res) {
	    new_tweet['sentiment']=res.result[0][0].label;
	    var snsPublish = require('aws-sns-publish');
 		snsPublish(new_tweet, {arn: 'arn:aws:sns:us-west-2:012274775406:tweet_sentiment'}).then(messageId => {
    		console.log(messageId);
    		done();
		});
	    
	});
    
  }
});
consume_new_tweet.on('error', function (err) {
  console.log(err.message);
});
consume_new_tweet.start();

var consume_sentiment_tweet=Consumer.create({
  queueUrl: 'https://sqs.us-west-2.amazonaws.com/012274775406/tweet_with_sentiment',
  handleMessage: function (message, done) {
  	var new_sentiment_tweet=JSON.parse(JSON.parse(message['Body'])['Message']);
  	var client = new elasticsearch.Client({
		  host: 'http://search-sentimenttweetsearch-ucm7t3h5bq6qiyjklppu22xrhy.us-west-2.es.amazonaws.com/'
		});
  client.index({
        index: "tweets",
        type: "tweet",
        body: new_sentiment_tweet
    }).then(function (result) {
    	console.log(result);
    	try{
    	var moment = require('moment');	
    	var now = moment();
		var formatted = now.format('YYYY-MM-DD HH:mm:ss Z');
		io.sockets.emit('new_index', formatted);}
		catch(e){
			console.log(e);
		}
    	var snsPublish = require('aws-sns-publish');
 		snsPublish(new_sentiment_tweet, {arn: 'arn:aws:sns:us-west-2:012274775406:send_via_socket'}).then(messageId => {
    		console.log(messageId);
    		done();
		});
    });
  }
});
consume_sentiment_tweet.on('error', function (err) {
  console.log(err.message);
});
consume_sentiment_tweet.start();

var consume_socket_tweet=Consumer.create({
  queueUrl: 'https://sqs.us-west-2.amazonaws.com/012274775406/send_via_socket',
  handleMessage: function (message, done) {
  	var new_socket_tweet=JSON.parse(JSON.parse(message['Body'])['Message']);
  	console.log(new_socket_tweet);
  	io.sockets.emit('new_tweet', new_socket_tweet);
  	done();
  }
});
consume_socket_tweet.on('error', function (err) {
  console.log(err.message);
});
consume_socket_tweet.start();

return router;
}
module.exports = returnRouter;