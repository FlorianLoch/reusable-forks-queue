#! /usr/bin/env node
const cp = require("child_process");
const fs = require("fs");
const tmp = require("tmp");
const path = require("path");

function requireReusableForksQueue(pathPrefix) {
  return require(path.join(pathPrefix, "reusableForksQueue.js"));
}

function bench(pathPrefix) {
  let q = new (requireReusableForksQueue(pathPrefix).ReusableForksQueue)("./benchmark.js", 1);

  const start = process.hrtime();

  q.on("allWorkDone", () => {
    const duration = process.hrtime(start);
    console.log(`Processing took ${duration[0] * 1e9 + duration[1]} ns.`);
  });

  for (let i = 0; i < 1E1; i++) {
    q.addJob(i)
  }

  q.start();
}

if (isFork()) {
  let sum = 0;
  requireReusableForksQueue(process.env["ReusableForksQueue.BenchmarkTmpDir"]).bootstrapFork(((val) => {
    sum += val;
  }));
}
else {
  tmp.setGracefulCleanup();

  const versionBBranch = process.argv[2];

  const tmpdir = tmp.dirSync();
  process.env["ReusableForksQueue.BenchmarkTmpDir"] = tmpdir.name;

  console.log(`Copying module to tmp dir (${tmpdir.name})...`);
  cp.spawnSync("cp", ["-r", ".", tmpdir.name]);
  console.log("=> Running with current branch...");
  bench(tmpdir.name);
  console.log(`=> Checking out branch '${versionBBranch}'...`);
  cp.spawnSync("git", ["checkout", versionBBranch]);
  console.log(`=> Running with '${versionBBranch}' branch...`);
  bench(tmpdir.name);
}

function isFork() {
  return process.env["ReusableForksQueue.Fork"] === "true";
}