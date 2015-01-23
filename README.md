# reusable-forks-queue
Module for spreading a queue of tasks over an arbitrary number of v8 processes. 
This processes run a given script ("child-module") and communicate with the framework via inter-process-messaging to receive a (new) task. The processes get reused to economize v8's startup time which makes batch processing of (synchronous) tasks like, e. g. parsing code with esprima, much faster.
If a fork dies, its latest job gets reenqueued (therefore the developer of the child-module needs to take care of transaction safety) and the fork gets replaced by a new worker process.
The amount of worker process can be set or is chosen equally to the amount of cpu cores.
When there are no more jobs in the queue the parent process kills the forks.
There are various events emitted by the framework in order to inform your application about the current state of processing.

## Example

### Your main application


### Batch-processing child-module