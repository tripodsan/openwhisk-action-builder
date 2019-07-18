/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */
/* eslint-disable no-underscore-dangle */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const unzip = require('unzip2');
const fse = require('fs-extra');

const CLI = require('../src/cli.js');

async function createTestRoot() {
  const dir = path.resolve(__dirname, 'tmp', crypto.randomBytes(16).toString('hex'));
  await fse.ensureDir(dir);
  return dir;
}

async function assertZipEntries(zipPath, entries) {
  // check zip
  const result = await new Promise((resolve, reject) => {
    const es = [];
    const srcStream = fse.createReadStream(zipPath);
    srcStream.pipe(unzip.Parse())
      .on('entry', (entry) => {
        es.push(entry.path);
        entry.autodrain();
      })
      .on('close', () => {
        resolve(es);
      })
      .on('error', reject);
  });
  entries.forEach((s) => {
    assert.ok(result.indexOf(s) >= 0, `${s} must be included in ${zipPath}`);
  });
}


const PROJECT_SIMPLE = path.resolve(__dirname, 'fixtures', 'simple');

describe('Build Test', () => {
  let testRoot;
  let origPwd;

  beforeEach(async () => {
    testRoot = await createTestRoot();
    await fse.copy(PROJECT_SIMPLE, testRoot);
    origPwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(origPwd);
    await fse.remove(testRoot);
  });

  it('generates the bundle', async () => {
    // need to change .cwd() for yargs to pickup `wsk` in package.json
    process.chdir(testRoot);
    const builder = new CLI()
      .prepare([
        '--verbose',
        '--directory', testRoot,
        '--entryFile', 'index.js',
      ]);

    await builder.run();

    await assertZipEntries(path.resolve(testRoot, 'dist', 'simple-package', 'simple-name.zip'), [
      'main.js',
      'package.json',
      'files/hello.txt',
    ]);

    // unzip action again
    const zipFile = path.resolve(testRoot, 'dist', 'simple-package', 'simple-name.zip');
    const zipDir = path.resolve(testRoot, 'dist', 'extracted');
    await new Promise((resolve, reject) => {
      fse.createReadStream(zipFile).pipe(unzip.Extract({
        path: zipDir,
      })
        .on('close', resolve)
        .on('error', reject));
    });

    // execute main script
    // eslint-disable-next-line global-require,import/no-dynamic-require
    const { main } = require(path.resolve(zipDir, 'main.js'));
    const ret = await main({});
    assert.equal(ret, 'Hello, world.\n');
  }).timeout(5000);
});
