/*
db.js

Copyright (C) 2016  Alexei Frolov, Larry Zhang
Developed at University of Toronto

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var Db = require('mongodb').Db;
var Server = require('mongodb').Server;
var logger = require('./log.js').logger;
var common = require('./common.js');
var bcrypt = require('bcryptjs');

var DB_HOST = process.env.DB_HOST || 'localhost';
var DB_PORT = process.env.DB_PORT || 27017;
var DB_NAME = process.env.DB_NAME || 'quizzard';

var db = new Db(DB_NAME, new Server(DB_HOST, DB_PORT));

var nextId = 0;
var usersCollection;
var questionsCollection;

/* Open a connection to the database. */
exports.initialize = function(callback) {
    db.open(function(err, db) {
        if (err) {
            logger.error(err);
            process.exit(1);
        }

        logger.info('Connection to Quizzard database successful.');
        usersCollection = db.collection('users');
        questionsCollection = db.collection('questions');

        getNextQuestionId(function(){
            logger.info('next question: %d', nextId);
            return callback();
        });
    });
}

// Users functions
// Add USER to usersCollection in the database
exports.addStudent = function(student, callback){
    addUser(student, callback);
}

exports.addAdmin = function(admin, callback){
    addUser(admin, callback);
}

var addUser = function(user, callback) {
    usersCollection.findOne({'id': user.id}, function(err, obj) {
        if (err) {
            logger.error(err);
            return callback(err, null);
        } else if (obj) {
            return callback('exists', null);
        } else {
            usersCollection.insert(user, function(err, res) {
                return callback(err, res);
            });
        }
    });
}

/* Return an array of users in the database. */
exports.getAdminsList = function(callback) {
    getUsersList(common.userTypes.ADMIN, callback);
}

exports.getStudentsList = function(callback) {
    getUsersList(common.userTypes.STUDENT, callback);
}

/* Return an array of users in the database, sorted by rank. */
var getUsersList = function(type, callback){
    usersCollection.find({type : type}).sort({id: 1}).toArray(function(err, docs) {
        if (err) {
            return callback(err, []);
        }

        for (s in docs) {
            delete docs[s]._id;
        }

        return callback(null, docs);
    });
}

exports.getStudentsListSorted = function(lim, callback){
    usersCollection.find({type: common.userTypes.STUDENT})
            .sort({points: -1})
            .limit(lim)
            .toArray(function(err, docs) {
        if (err) {
            return callback(err, []);
        }

        for (s in docs) {
            delete docs[s]._id;
        }

        return callback(null, docs);
    });
}

exports.getUserById = function(userId, callback){
    getUserById(userId, callback);
}

var getUserById = function(userId, callback) {
    usersCollection.findOne({id: userId}, function(err, user) {
        if (err) {
            return callback('failure', null);
        }

        delete user._id;
        return callback(null, user);
    });
}

/*
 * Check if the account given by user and pass is valid.
 * user type of null
 */
exports.checkLogin = function(userId, pass, callback) {
    usersCollection.findOne({'id' : userId}, function(err, obj) {
        if (err) {
            logger.error(err);
            return callback(err, null);
        }

        if (!obj) {
            return callback('notExist', null);
        }

        validatePassword(obj, pass, function(err, valid) {
            if (err) {
                return callback(err, null);
            }
            if (valid) {
                delete obj._id;
                delete obj.password;
                return callback(null, obj);
            }
            return callback('invalid', null);
        });
    });
}

/*
 * Check the hash of pass against the password stored in userobj.
 */
var validatePassword = function(userobj, pass, callback) {
    bcrypt.compare(pass, userobj.password, function(err, obj) {
        callback(err, obj);
    });
}

// cleanup the users collection
exports.removeAllUsers = function(callback){
    usersCollection.remove({}, function(err, obj) {
        if (err) {
            logger.error(err);
            return callback(err, null);
        }
        logger.info('All users have been removed');
        return callback(null, obj);
    });
}

/*
 * Fetch the user object with ID userId in the users database.
 */
exports.getStudentById = function(studentId, callback) {
    getUserById(studentId, callback);
}

exports.getAdminById = function(adminId, callback) {
    getUserById(adminId, callback);
}

var getUserById = function(userId, callback){
    usersCollection.findOne({id : userId}, function(err, obj) {
        if (err) {
            logger.error(err);
            return callback(err, null);
        }

        return callback(null, obj);
    });
}

// Update a student record using its Id
exports.updateUserById = function(userId, info, callback){
    updateUserById(userId, info, callback);
}

exports.updateStudentById = function(userId, info, callback){
    updateUserById(userId, info, callback);
}

exports.updateAdminById = function(userId, info, callback){
    updateUserById(userId, info, callback);
}

var updateUserById = function(userId, info, callback){
    var query = { id:userId };
    var update = {};

    update.$addToSet = {};
    update.$inc = {};
    update.$pull = {};
    update.$set = {};

    if (info.id) {
        update.$set.id = info.id;
    }

    if (info.fname) {
        update.$set.fname = info.fname;
    }

    if (info.lname) {
        update.$set.lname = info.lname;
    }

    if (info.email) {
        update.$set.email = info.email;
    }

    if (typeof info.correct !== 'undefined') {
        if (info.correct) {
            update.$addToSet.answered = info.questionId;
            update.$inc.points = info.points;
            update.$inc.answeredCount = 1;
            update.$pull.attempted = { $in : [info.questionId] };
        } else {
            update.$addToSet.attempted = info.questionId;
            update.$inc.attemptedCount = 1;
            update.$pull.answered = { $in : [info.questionId] };
        }
    }

    if (isEmptyObject(update.$addToSet)) {
        delete update.$addToSet;
    }

    if (isEmptyObject(update.$inc)) {
        delete update.$inc;
    }

    if (isEmptyObject(update.$set)) {
        delete update.$set;
    }

    if (isEmptyObject(update.$pull)) {
        delete update.$pull;
    }

    if (typeof info.newPassword === 'undefined') {
        usersCollection.update(query, update, function(err, obj) {
            if (err) {
                logger.error(err);
                return callback(err, null);
            }

            return callback(null, 'success');
        });
    } else {
        bcrypt.hash(info.newPassword, 11, function(err, hash) {
            if (err) {
                logger.error(err);
                return callback(err, null);
            }

            if (update.$set && !isEmptyObject(update.$set)) {
                update.$set.password = hash;
            } else {
                update.$set = {password:hash};
            }

            usersCollection.update(query, update, function(err, obj) {
                if (err) {
                    logger.error(err);
                    return callback(err, null);
                }

                return callback(null, 'success');
            });
        });
    }
}

// check if json obejct is empty
var isEmptyObject = function(obj) {
    for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            return false;
        }
    }
    return true;
}

// Questions functions
// Add QUESTION to questionsCollection in the database
exports.addQuestion = function(question, callback){
	question.id = ++nextId;
    questionsCollection.insert(question, function(err, res) {
        if(err){
            logger.error(err);
            return callback(err, null);
        }

        return callback(null, res);
    });
}

// cleanup the users collection
exports.removeAllQuestions = function(callback){
    questionsCollection.remove({}, function(err, res) {
        if(err){
            logger.error(err);
            return callback(err, null);
        }

        nextId = 0;
        logger.info('All questions have been removed');
        logger.info('next question: %d', nextId);
        return callback(null, res);
    });
}

// getNextQuestionId
var getNextQuestionId = function(callback){
  	questionsCollection.find().sort({id: -1}).limit(1).toArray(function(err, docs) {
        if (err) {
            logger.error(err);
            process.exit(1);
        }

        nextId = docs[0] ? docs[0].id : 0;
        return callback(nextId);
    });
}

exports.getQuestionsListByUser = function(request, callback) {
    var questionsQuery = {};
    var user = request.user;
    var questionsStatus = request.questionsStatus;

    if (!user) {
        return callback('No user object', null);
    }

    if (user.type == common.userTypes.ADMIN) {
        questionsCollection.find(questionsQuery).sort({id: 1}).toArray(function(err, docs) {
            if (err) {
                return callback(err, null);
            }

            for (q in docs) {
                docs[q].firstAnswer = docs[q].answered[0] ? docs[q].answered[0] : 'No One';
                docs[q].attemptedCount = docs[q].attempted.length;
                docs[q].answeredCount = docs[q].answered.length;
                docs[q].totalCount = docs[q].attempted.length + docs[q].answered.length;
                delete docs[q]._id;
            }

            return callback(null, docs);
        });
    } else if (user.type == common.userTypes.STUDENT) {
        questionsQuery.visible = true;

        getUserById(user.id, function(err, requiredUser) {
            if (err) {
                return callback(err, null);
            }

            questionsCollection.find(questionsQuery).sort({id: 1}).toArray(function(err, docs) {
                if (err) {
                    return callback(err, null);
                }

                var compareList = requiredUser.answered;
                var answeredList = [];
                var UnansweredList = [];

                for (q in docs) {
                    docs[q].firstAnswer = docs[q].answered[0] ? docs[q].answered[0] : 'No One';
                    docs[q].attemptedCount = docs[q].attempted.length;
                    docs[q].answeredCount = docs[q].answered.length;
                    docs[q].totalCount = docs[q].attempted.length + docs[q].answered.length;
                    delete docs[q]._id;

                    if (compareList.indexOf(docs[q].id) == -1) {
                        UnansweredList.push(docs[q]);
                    } else {
                        answeredList.push(docs[q]);
                    }
                }

                var returnList = (questionsStatus === 'answered') ? answeredList : UnansweredList;
                return callback(null, returnList);
            });
        });
    }
}

exports.findQuestions = function(amount, findType, user, callback){
    var criteria, query;

    if (findType & common.sortTypes.SORT_DEFAULT) {
        criteria = {id: 1};
    } else if (findType & common.sortTypes.SORT_TOPIC) {
        critera = {topic : 1};
    } else if (findType & common.sortTypes.SORT_POINTS) {
        critera = {points : -1};
    } else {
        criteria = {};
    }

    if (findType & common.sortTypes.QUERY_ANSWERED) {
        if (findType & common.sortTypes.QUERY_ANSONLY) {
            query = { id: { $in: user.answered } };
        } else {
            query = {};
        }
    } else if (user != null) {
        query = { id: { $nin: user.answered } };
    }

    questionsCollection.find(query).sort(criteria).limit(amount).toArray(function(err, docs) {
        if (err) {
            return callback(err, null);
        }

        if (findType & common.sortTypes.SORT_RANDOM) {
            shuffle(docs);
        }

        for (q in docs) {
            docs[q].firstAnswer = docs[q].answered[0] ? docs[q].answered[0] : 'No One';
            docs[q].attemptedCount = docs[q].attempted.length;
            docs[q].answeredCount = docs[q].answered.length;
            docs[q].totalCount = docs[q].attempted.length + docs[q].answered.length;
            delete docs[q]._id;
        }

        return callback(null, docs);
    });
}

/* Classic Fisher-Yates shuffle. Nothing to see here. */
var shuffle = function(arr) {
    var curr, tmp, rnd;

    curr = arr.length;

    while (curr) {
        rnd = Math.floor(Math.random() * curr);
        --curr;
        tmp = arr[curr];
        arr[curr] = arr[rnd];
        arr[rnd] = tmp;
    }
}

/* Sort questions by the given sort type. */
exports.sortQuestions = function(questions, type, callback) {
    var cmpfn;

    if (type & common.sortTypes.SORT_RANDOM) {
        shuffle(questions);
        return callback(null, questions);
    } else if (type & common.sortTypes.SORT_TOPIC) {
        cmpfn = function(a, b) {
            return a.topic < b.topic ? -1 : 1;
        };
    } else if (type & common.sortTypes.SORT_POINTS) {
        cmpfn = function(a, b) {
            return b.points - a.points;
        };
    } else {
        cmpfn = function(a, b) { return -1; };
    }

    questions.sort(cmpfn);
    return callback(null, questions);
}

/* Extract a question object from the database using its ID. */
exports.lookupQuestionById = function(questionId, callback) {
    questionsCollection.findOne({id: questionId}, function(err, question) {
        if (err) {
            return callback(err, null);
        }

        if (!question) {
            return callback('No question found', null);
        }

        /* necessary for later database update */
        question.firstAnswer = question.answered[0] ? question.answered[0] : 'No One';
        question.attemptedCount = question.attempted.length;
        question.answeredCount = question.answered.length;
        question.totalCount = question.attempted.length + question.answered.length;
        delete question._id;
        return callback(null, question);
    });
}

// update a question record based on its id
exports.updateQuestionById = function(questionId, request, callback){
    var query = { id:questionId };
    var update = {};

    update.$addToSet = {};
    update.$push = {};
    update.$pull = {};
    update.$set = {};

    if (request.topic) {
      update.$set.topic = request.topic;
    }

    if (request.title) {
      update.$set.title = request.title;
    }

    if (request.text) {
      update.$set.text = request.text;
    }

    if (request.answer) {
      update.$set.answer = request.answer;
    }

    if (request.hint) {
      update.$set.hint = request.hint;
    }

    if (request.points) {
      update.$set.points = request.points;
    }

    if (request.visible) {
        update.$set.visible = (request.visible === 'true');
    }

    if (typeof request.correct !== 'undefined') {
        if (request.correct) {
            update.$addToSet.answered = request.userId;
            update.$pull.attempted = { $in : [request.userId] };
        } else {
            update.$addToSet.attempted = request.userId;
            update.$push.attempts = request.attempt;
            update.$pull.answered = { $in : [request.userId] };//to be removed
        }
    }

    if (isEmptyObject(update.$addToSet)) {
        delete update.$addToSet;
    }

    if (isEmptyObject(update.$push)) {
        delete update.$push;
    }

    if (isEmptyObject(update.$set)) {
        delete update.$set;
    }

    if (isEmptyObject(update.$pull)) {
        delete update.$pull;
    }

    questionsCollection.update(query, update, function(err, info) {
        if (err) {
            logger.error(err);
            return callback(err, null);
        }

        return callback(null, 'success');
    });
}
