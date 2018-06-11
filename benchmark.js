#! /usr/bin/env node
const cp = require("child_process");
const fs = require("fs");
const tmp = require("tmp");
const path = require("path");

function requireReusableForksQueue(pathPrefix) {
  return require(path.join(pathPrefix, "reusableForksQueue.js"));
}

async function bench(pathPrefix) {
  let q = new (requireReusableForksQueue(pathPrefix).ReusableForksQueue)("./benchmark.js", 1);

  const start = process.hrtime();

  const prom = new Promise(resolve => {
    q.on("allWorkDone", () => {
      const duration = process.hrtime(start);
      resolve(duration[0] * 1E9 + duration[1]);
    });
  });

  for (let i = 0; i < 1E5; i++) {
    q.addJob(i)
  }

  q.start();

  return prom;
}

(async function shootgun () {
  function isFork() {
    return process.env["ReusableForksQueue.Fork"] === "true";
  }

  async function loopAndAvg(fun) {
    const results = [];

    for (let i=0; i < 10; i++) {
      results.push(await fun());
    }

    const avg = results.reduce((acc, val) => {
      return acc + val;
    }, 0) / results.length;

    return Promise.resolve(avg);
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
    const commonOpts = {
      cwd: tmpdir.name
    };

    console.log(`Copying module to tmp dir (${tmpdir.name})...`);
    cp.spawnSync("cp", ["-r", ".", tmpdir.name]);

    console.log("=> Running with current branch...");
    const versionADuration = await loopAndAvg(bench.bind(null, tmpdir.name));
    console.log(`=> Processing took ${versionADuration} ns (${versionADuration / 1e9} s).`);

    console.log(`=> Checking out branch '${versionBBranch}'...`);
    cp.spawnSync("git", ["stash"], commonOpts);
    cp.spawnSync("git", ["checkout", versionBBranch], commonOpts);

    console.log(`=> Running with '${versionBBranch}' branch...`);
    const versionBDuration = await loopAndAvg(bench.bind(null, tmpdir.name));
    console.log(`=> Processing took ${versionBDuration} ns (${versionBDuration / 1e9} s).`);
  }
})();