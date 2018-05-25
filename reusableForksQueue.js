var cP = require("child_process");
var util = require("util");
var EventEmitter = require("events").EventEmitter;
var os = require("os");


function ReusableForksQueue (modulePath, numForks) {
  this.numForks = numForks || os.cpus().length;
  this.modulePath = modulePath;

  this.resetQueue();
  this.currentForksCount = 0;
  this.jobsDoneCount = 0;
  this.running = false;
  this.workIsDone = false;
};

util.inherits(ReusableForksQueue, EventEmitter);

ReusableForksQueue.prototype.addJob = function (args) {
  const job = {
    args: args,
    next: undefined
  }
  if (!this.jobLinkedList.first) {
    this.jobLinkedList.first = job
  } else {
    const curLastJob = this.jobLinkedList.last
    curLastJob.next = job
  }
  this.jobLinkedList.last = job
}

ReusableForksQueue.prototype.resetQueue = function () {
  this.jobLinkedList = { first: undefined, last: undefined };
}

ReusableForksQueue.prototype.start = function () {
  if (this.running) {
    throw new Error("ReusableForksQueue instance has already been started.");
  }

  this.currentForksCount = 0;
  this.jobsDoneCount = 0;
  this.workIsDone = false;
  this.running = true;

  for (var i = 0; i < this.numForks; i++) {
    this._launchFork();
  }
};

ReusableForksQueue.prototype._getNextArgs = function () {
  const firstJob = this.jobLinkedList.first
  if (!firstJob) return
  this.jobLinkedList.first = firstJob.next
  if (!firstJob.next) this.jobLinkedList.last = undefined
  return firstJob.args
};

ReusableForksQueue.prototype._launchFork = function () {
  var self = this;

  if (!this.jobLinkedList.last) {
    return;
  };

  this.currentForksCount++;

  var fork = cP.fork(this.modulePath);
  var thisForksCurrentJob;

  fork.on("exit", function (code) {

    self.currentForksCount--;

    if (!self.workIsDone) {
      self.emit("forkDied", code, self.jobsDoneCount, thisForksCurrentJob);
      console.log(thisForksCurrentJob);
      if (thisForksCurrentJob !== undefined) {
        self.addJob(thisForksCurrentJob);
        thisForksCurrentJob = undefined;
      }
      self._launchFork();
    }

    if (self.currentForksCount === 0 && !self.jobLinkedList.last) {
      self.running = false;
      self.emit("allJobsEnded", self.jobsDoneCount);
    }
  });

  fork.on("message", function (msg) {
    if (msg === "giveMeWork") {
      thisForksCurrentJob = self._giveForkWork(fork, false);
      return;
    }

    if (msg === "giveMeMoreWork") {
      self.emit("jobEnded", self.jobsDoneCount, thisForksCurrentJob);
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
    this.workIsDone = true;
    fork.kill();
    return;
  }

  fork.send({
    message: "doThisWork",
    args: nextArgs
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
