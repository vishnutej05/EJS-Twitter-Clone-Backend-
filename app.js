const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http:/localhost:3000/");
    });
  } catch (e) {
    console.log(e.message);
  }
};

initializeDBAndServer();

const authenticate = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        // console.log(error);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUser = `SELECT * FROM user WHERE username = '${username}';`;
  const hashedPass = await bcrypt.hash(password, 10);
  const user = await db.get(selectUser);
  //   console.log(user);
  if (user === undefined) {
    if (password.length < 6) {
      response.status(400).send("Password is too short");
    } else {
      const query = `
            INSERT INTO 
            user(name,username,password,gender)
            VALUES(
                '${name}',
                '${username}',
                '${hashedPass}',
                '${gender}'
            );`;
      const resp = await db.run(query);
      response.send("User created successfully");
    }
  } else {
    response.status(400).send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUser = `SELECT * FROM user WHERE username = '${username}';`;
  const user = await db.get(selectUser);
  //   console.log(user);
  if (user === undefined) {
    response.status(400).send("Invalid user");
  } else {
    const isPassSame = await bcrypt.compare(password, user.password);
    if (isPassSame) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400).send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticate, async (request, response) => {
  const { username } = request;
  const selectUser = `SELECT 
        user.username,
        tweet.tweet,
        tweet.date_time as dateTime
     FROM 
        follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        INNER JOIN user ON user.user_id = tweet.user_id
        WHERE
        follower.follower_user_id = (select user_id from user where username = '${username}')
        ORDER BY
        tweet.date_time DESC
        LIMIT 4;`;
  const tweets = await db.all(selectUser);
  response.send(tweets);
});

//API 4
app.get("/user/following/", authenticate, async (request, response) => {
  const { username } = request;
  const query = `select name 
    from user 
    where 
    user_id in 
    (select following_user_id 
        from follower 
        where 
        follower_user_id = (select user_id from user 
            where 
            username = '${username}'));`; //if we want to know whom we are following then we should be in their followers list

  const people = await db.all(query);
  response.send(people);
});

//API 5
app.get("/user/followers/", authenticate, async (request, response) => {
  const { username } = request;
  const query = `select name  
  from user 
  where 
  user_id in (select follower_user_id 
    from follower 
    where 
    following_user_id = (select user_id 
        from user 
        where 
        username = '${username}'));`; //if we want to know the followers then we should be in their following list

  const people = await db.all(query);
  response.send(people);
});

//API 6
app.get("/tweets/:tweetId/", authenticate, async (request, response) => {
  
  const { username } = request;
  const { tweetId } = request.params;

  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  console.log("Current User: ",getUserId.user_id); // The Current user who is logged In

  
  const selectUser = `
    select user_id from
     user 
     where 
     user_id in (select following_user_id 
        from follower 
        where 
        follower_user_id = (select user_id 
            from user 
            where 
            username = '${username}'));`; // people whom the user is following

  const resp = await db.all(selectUser);

  const temp = [];
  resp.map((each) => temp.push(each.user_id));

  const usersTweet = `select user_id 
  from tweet 
  where 
  tweet_id = ${tweetId};`;

  const tweet = await db.get(usersTweet);

  if (temp.includes(tweet.user_id)) {
    //If the user requests a tweet of the user he is following
    const resQuery = `
    select 
    (select tweet from tweet where tweet_id=${tweetId}) as tweet,
    (select count(tweet_id) from like where tweet_id=${tweetId}) as likes,
    (select count(tweet_id) from reply where tweet_id=${tweetId}) as replies,
    (select date_time from tweet where tweet_id = ${tweetId}) as dateTime;`;
    const resTweet = await db.get(resQuery);
    response.send(resTweet);
  } else {
    response.status(401).send("Invalid Request"); //If the user requests a tweet other than the users he is following
  }
});

//API 7
app.get("/tweets/:tweetId/likes/", authenticate, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const query = `select user_id from user
    where user_id in (select following_user_id from follower 
        where follower_user_id = (select user_id from user
            where username = '${username}'))`;

  const following = await db.all(query);
  let followingList = [];
  following.map((each) => followingList.push(each.user_id));

  // console.log(followingList);

  const tweet = `select user_id from tweet where tweet_id = ${tweetId};`;
  const tweets = await db.get(tweet);
  console.log(tweets);

  if (followingList.includes(tweets.user_id)) {
    const usersLiked = `select user.username as likes
      from user JOIN like 
      on user.user_id = like.user_id
      where tweet_id = ${tweetId};`;
    const users = await db.all(usersLiked);
    const likes = [];
    users.map((each) => likes.push(each.likes));
    response.send({ likes });
  } else {
    response.status(401).send("Invalid Request");
  }
});

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const followingQuery = `
    select user_id 
    from user 
    where user_id in (select following_user_id
        from follower
        where follower_user_id = (select user_id from user
            where username = '${username}'));`;
    const resp = await db.all(followingQuery);
    // console.log(resp);
    let following = [];
    resp.map((each) => following.push(each.user_id));

    const tweets = `select user_id from tweet where tweet_id = ${tweetId};`;
    const tweet = await db.get(tweets);
    // console.log(tweet);

    if (following.includes(tweet.user_id)) {
      const res = `
        select user.name as name,reply.reply as reply
        from user join reply on user.user_id = reply.user_id
        where reply.tweet_id = ${tweetId};`;
      const replies = await db.all(res);
      response.send({ replies });
    } else {
      response.status(401).send("Invalid Request");
    }
  }
);

//API 9 get tweets made by user
app.get("/user/tweets/", authenticate, async (request, response) => {
  let { username } = request;
  const userTweets = `SELECT
    tweet.tweet,
    (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
    (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
    tweet.date_time AS dateTime
FROM
    tweet
WHERE
    tweet.user_id = (SELECT user_id FROM user WHERE username = '${username}');
`;
  const getTweetIdsArray = await db.all(userTweets);
  response.send(getTweetIdsArray);
});

//API 10

app.post("/user/tweets/", authenticate, async (request, response) => {
  let { username } = request;
  const { tweet } = request.body;

  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const currentDate = new Date();

  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;

  const responseResult = await db.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  console.log(tweet_id);
  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  console.log(username);
  const tweetQuery = `select tweet_id from tweet
     where user_id = (select user_id from user where username = '${username}');`;
  const tweet = await db.all(tweetQuery);
  console.log(tweetId);

  let userTweets = [];
  tweet.map((each) => userTweets.push(each.tweet_id));

  if (userTweets.includes(Number(tweetId))) {
    const deleteTweet = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteTweet);
    response.send("Tweet Removed");
  } else {
    response.status(401).send("Invalid Request");
  }
  console.log(userTweets);
});

module.exports = app;
