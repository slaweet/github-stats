// Script to fetch releases from github api and save download numbers to csv file for further analyses
// The script caches data in a file, the cache expires in one day
//
// NPM Dependencies:
// npm i objects-to-csv request
// Usage:
// node downloadsStatsToCSV.js <repo_owner> <repo_name>
//
// E.g. node downloadsStatsToCSV.js LiskHQ lisk-hub

const ObjectsToCsv = require('objects-to-csv');
const request = require("request");

const outputFile = './lisk-hub-downloads.csv';
var fs = require('fs'),
    releases = [];

const repoOwner = process.argv[2];
const repoName = process.argv[3];
const githubApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases`;

([ ...new Array(2)]).map((x, i) => {
  const fileName = `/tmp/lisk-hub-downloads-${i}.json`;
  fetchData(fileName, i + 1).then(() => {
    fs.readFile(fileName, handleFile)
  });
});

function fetchData(fileName, page) {
  const url = `${githubApiUrl}?access_token=${process.env.GH_TOKEN}&page=${page}`;
  const options = {
    url,
    headers: {
      'User-Agent': 'request',
    },
  }
  return new Promise(function(resolve, reject){
    if (!isRecentFile(fileName)) {
      request.get(options, (error, response, body) => {
        fs.writeFile(fileName, body, function(err) {
          if(err) {
              reject();
              return console.log(err);
          }
          resolve();
        });
      });
    } else {
      resolve();
    }
  });
};

function isRecentFile(fileName) {
  if (!fs.existsSync(fileName)) {
    return false;
  }
  var dayAgo = new Date().getTime() - (24 * 60 * 60 * 1000)
  var stats = fs.statSync(fileName);
  var mtime = new Date(stats.mtime);
  return mtime.getTime() > dayAgo;
}


function getDownloadsFor(release, platform) {
  return release.assets.filter(asset => (
      asset.name.indexOf(platform) !== -1 &&
      asset.name.indexOf('blockmap') === -1
    )).reduce((sum, asset) => {
      sum += asset.download_count;
      return sum
    }, 0);
}

function getReleases(data) {
    let releases = data
    .filter(release => !release.prerelease
    ).map(release => ({
        release: release.tag_name,
        published_at: release.published_at,
        // published_at2: dateFormat(release.published_at, 'd/m/yyyy'),
        win: getDownloadsFor(release, 'win'),
        mac: getDownloadsFor(release, 'mac-'),
        linux: getDownloadsFor(release, 'AppImage'),
        win_check_updates: getDownloadsFor(release, 'latest.yml'),
        mac_check_updates: getDownloadsFor(release, 'latest-mac.yml'),
      })
    ).reverse();
    return releases;
}

function addDownloadsPerDay(releases) {
    releases = releases.map((r, i) => ({
        ...r,
        latest_for_n_days: (
          (new Date((releases[i + 1] ? releases[i + 1].published_at : new Date())) - new Date(r.published_at)) /
          (1000 * 60 * 60 * 24)
        ).toFixed(2),
      })
    );
    releases = releases.map((r, i) => ({
        ...r,
        win_per_day: (r.win / r.latest_for_n_days).toFixed(2),
        mac_per_day: (r.mac / r.latest_for_n_days).toFixed(2),
        linux_per_day: (r.linux / r.latest_for_n_days).toFixed(2),
        win_check_updates_per_day: (r.win_check_updates / r.latest_for_n_days).toFixed(2),
        mac_check_updates_per_day: (r.mac_check_updates / r.latest_for_n_days).toFixed(2),
      })
    );
    return releases;
}

async function handleFile(err, data) {
    if (err) throw err
    releases = releases.concat(getReleases(JSON.parse(data)));
    releases = addDownloadsPerDay(releases);

    let csv = new ObjectsToCsv(releases);
    await csv.toDisk(outputFile);
    console.log(await csv.toString());
}
