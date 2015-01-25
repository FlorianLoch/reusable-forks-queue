# reusable-forks-queue
Module for spreading a queue of tasks over an arbitrary number of v8 processes. 
This processes run a given script ("child-module") and communicate with the framework via inter-process-messaging to receive a (new) task. The processes get reused to economize v8's startup time which makes batch processing of (synchronous) tasks like, e. g. parsing code with esprima, much faster.

If a fork dies, its latest job gets enqueued again (therefore the developer of the child-module needs to take care of transaction safety) and the fork gets replaced by a new worker process.
The amount of worker process can be set or is chosen equally to the amount of cpu cores.
When there are no more jobs in the queue the parent process kills the forks.

There are various events emitted by the framework in order to inform your application about the current state of processing - see API section.


## Example
### Main application
	var ReusableForksQueue = require("reusable-forks-queue").ReusableForksQueue;
	var q = new ReusableForksQueue(path.join(__dirname, "fork_script.js"), parallelism);

	q.on("jobMessage", function (msg, jobsDoneCount) {
		//Handle the event
	});

	q.on("allJobsEnded", function (jobsDoneCount) {
		//Handle the event
		console.log("Finished! Jobs done: " + jobsDoneCount);
	});

	//Register on further events
	var args = {
		filepath: "sample.txt"
	};
	q.addJob(args); //args might be anything
	q.addJob(...); //fill up the queue

	q.start();

### Batch-processing child-module
The child module simply has to send the message ````giveMeWork```` after start to get its first job, subsequently it should send ````giveMeMoreWork```` to get a new job and raise the counter of the framework. The job gets send to the fork via message-event emitted by process.


The fork module automatically gets killed by the parent when there is no more work to do. If it dies before work is done it gets recreated and its old job gets enqueued again.

	//start of fork script containing "requires" etc.

	process.on("message", function (msg) {
		if (msg.message === "doThisWork") {
			processFile(msg.args.filepath);

			process.send("giveMeMoreWork");
		}
	});

	process.send("giveMeWork");

	function processFile(filepath) {
		//do something with the file (in this scenario work should 
		//get done synchronously, but it could also done 
		//asynchronously by sending "giveMeMoreWork" in the callback function)
	}

	//Alternativly there is a bootstraping function with might speed up things
	var bootstrapFork = require("reusable-forks-queue").bootstrapFork;

	bootstrapFork(function (jobArgs) {
		processFile(jobArgs);
	}); //automatically requests the first job

	//This can also handle asynchronous functions
	bootstrapFork(function (jobArgs, done) {
		processFile(jobArgs, done); //processFile needs to call done() when done
	}, true); 	


## API
### Public interface
````ReusableForksQueue(modulePath, [numberOfForks])````: Constructor function; needs to be given the path of the script that should be run as fork. Optional the number of forks can be set, otherwise the amount of cpu cores will be used as default value.


````addJob(args)````: Adds a job to the queue. A "job" should be an object/array containing the information needed by the fork to do its task. args can be anything that can be serialized to JSON for interprocess communication. Object sharing between parent process and fork is NOT possible. Jobs added after "allJobsEnded" has been emitted by the queue instance will not be handled anymore. Therefore the instance has to be reseted and restarted.


````start()````: Tells the framework to create the forks. Starts the processing of the queued jobs.


````resetQueue()````: Empties the queue, has to be called in case of reusing the queue instance itself

### Emitted events
reusable-forks-queue extends node's [EventEmitter](http://nodejs.org/api/events.html) - registering on an event therefore is done as usual.

````"jobMessage" (msg, self.jobsDoneCount)````: Can be any message from the child to the parent (except "giveMeWork" and "giveMeMoreWork" which will not be forwarded to the parent)


````"allJobsEnded" (jobsDoneCount)````: Emitted once, when the queue ran out of jobs and all forks have been stopped


````"forkDied" (exit_code, jobsDoneCount, thisForksCurrentJob)````: Emitted when a fork died (not sent when the fork has been killed by the framework)


### Reporting an issue/a bug
Please report any issue or bug via GitHub's issue tracker!


````"jobDone" (jobsDoneCount, thisForksCurrentJob)````: Emitted per done job, can be used for measuring progress etc.