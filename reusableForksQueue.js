var cP = require("child_process");
var util = require("util");
var EventEmitter = require("events").EventEmitter;
var os = require("os");


function ReusableForksQueue (modulePath, numForks, failureThreshold) {
  this.numForks = numForks || os.cpus().length;
  this.modulePath = modulePath;

  this.failureThreshold = 2;
  this.jobArgs = [];
  this.forks = [];
  this.waitingList = [];
  this.currentForksCount = 0;
  this.jobsDoneCount = 0;
  this.jobsFailedCount = 0;
  this.workIsDone = false;

  for (var i = 0; i < this.numForks; i++) {
    this._launchFork();
  }
};

util.inherits(ReusableForksQueue, EventEmitter);

ReusableForksQueue.prototype.addJob = function (args, failureOffset) {
  failureOffset = failureOffset || 0;

  this.jobArgs.push({
    args: args,
    failures: failureOffset
  });

  if (this.waitingList.length !== 0) {
    var fork = this.waitingList.shift();
    this._giveForkWork(fork, false);
  }
}

ReusableForksQueue.prototype.stop = function () {
  this.workIsDone = true;

  forks.forEach(function (fork) {
    fork.kill();
  });
};

ReusableForksQueue.prototype._getNextArgs = function () {
  return this.jobArgs.shift();
};

ReusableForksQueue.prototype._launchFork = function () {
  var self = this;

  var fork = cP.fork(this.modulePath);
  var thisForksCurrentJob;

  var arrayPosition = this.forks.length;
  this.forks.push(fork);
  this.currentForksCount++;

  fork.on("exit", function (code) {
    this.forks[arrayPosition] = undefined;
    self.currentForksCount--;

    if (self.workIsDone) return;

    self._launchFork();      
    
    if (thisForksCurrentJob === undefined) return;
      
    thisForksCurrentJob.failures++;
    if (thisForksCurrentJob.failures === self.failureThreshold) {
      self.jobsFailedCount++;
      self.emit("jobEnded", self.jobsDoneCount, self.jobsFailedCount, thisForksCurrentJob, false);
    }
    else {
      self.addJob(thisForksCurrentJob.args, thisForksCurrentJob.failures);
    }

    self.emit("forkDied", code, self.jobsDoneCount, self.jobsFailedCount, thisForksCurrentJob);   
  });

  fork.on("message", function (msg) {
    if (msg === "giveMeWork") {
      thisForksCurrentJob = self._giveForkWork(fork, false);
      return;
    }

    if (msg === "giveMeMoreWork") {
      self.emit("jobEnded", self.jobsDoneCount, self.jobsFailedCount, thisForksCurrentJob, true);
      thisForksCurrentJob = self._giveForkWork(fork, true)
      return;
    }    

    self.emit("jobMessage", msg, self.jobsDoneCount);
  });
};

ReusableForksQueue.prototype._giveForkWork = function (fork, moreWork) {
  var nextArgs = this._getNextArgs();

  if (moreWork) this.jobsDoneCount++;

  if (nextArgs === undefined) {
    this.waitingList.push(fork);
    return;
  }

  fork.send({
    message: "doThisWork",
    args: nextArgs.args
  });

  return nextArgs;
}

function bootstrapFork(jobHandler, async) {
  process.on("message", function (msg) {
    if (msg.message === "doThisWork") {
      if (!async) {
        jobHandler(msg.args);
        process.send("giveMeMoreWork");
        return;
      }

      jobHandler(msg.args, function () {
        process.send("giveMeMoreWork");
      });
    }
  });

  process.send("giveMeWork");  
}

module.exports = {
  ReusableForksQueue: ReusableForksQueue,
  bootstrapFork: bootstrapFork
};