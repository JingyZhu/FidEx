const fs = require('fs');
const { program } = require('commander');
const fetch = require('node-fetch');
const jsparse = require('./js-parse');

program
    .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
    .option('-f --file <filename>', 'Filename prefix', 'test')
    .option('-t --timestamp <timestamp>', 'timestamp for the archive', null)
    .option('-a --archive <archive>', 'Archive list to record the page', 'test')
    .option('--hostname <hostname>', "Hostname where archive system is running", 'http://localhost:8080')

program.parse();
const options = program.opts();
const dirname = options.dir;
const filename = options.file;
const timestamp = options.timestamp;
const archive = options.archive;
const hostname = options.hostname;

function parseTS(ts) {
    const year = parseInt(ts.substring(0, 4), 10);
    const month = parseInt(ts.substring(4, 6), 10) - 1; // Month is 0-indexed in JavaScript Date
    const day = parseInt(ts.substring(6, 8), 10);
    const hour = parseInt(ts.substring(8, 10), 10);
    const minute = parseInt(ts.substring(10, 12), 10);
    const second = parseInt(ts.substring(12, 14), 10);

    return new Date(year, month, day, hour, minute, second);
}

function skipURL(url) {
    if (!url)
        return true;
    const skipList = [
        '__awp_main_inject__',
        'chrome-extension://',
        'pptr://__puppeteer_evaluation_script__'
    ]
    for (const skip of skipList) {
        if (url.includes(skip))
            return true;
    }
    return false;
}

/* Since start in AST node usually includes comments, whitespaces and newlines,
   use the given text to calibrate the start to exclude those.
*/
function calibrateStart(file, start, end, text) {
    let origText = file.substring(start, end);
    for (let i = 0; i < origText.length; i++) {
        if (origText.substring(i) == text) {
            return start + i;
        }
    }   
}

class ArchiveMatcher {
    constructor() {
        this.cdx_cache = {};
        this.response_cache = {};
        this.jsparse_cache = {};
    }

    async getResourceURL(url, hasID=false, ts=null) {
        // Request to cdx server for ts
        const queryURL = `${hostname}/${archive}/cdx?url=${url}&output=json`;
        let r = null;
        if (!(queryURL in this.cdx_cache)) {
            r = await fetch(`${hostname}/${archive}/cdx?url=${url}&output=json`);
            r = await r.text();
            this.cdx_cache[queryURL] = r;
        }
        r = this.cdx_cache[queryURL]; 
        let records = [];
        r.split('\n').forEach(line => {
            if (line.length > 0) {
                records.push(JSON.parse(line));
            }
        })
        let targetURL = null;
        // If there is ts, get the resource that is closest to ts
        if (!ts) {
            targetURL = records[0];
        }
        else {
            ts = parseTS(ts);
            let closest = null;
            let closestDiff = null;
            for (const item of records) {
                const itemTs = parseTS(item.timestamp);
                const diff = Math.abs(ts - itemTs);
                if (closestDiff === null || diff < closestDiff) {
                    closest = item;
                    closestDiff = diff;
                }
            }
            targetURL = closest;
        }
        return `${hostname}/${archive}/${targetURL.timestamp}` 
                + (hasID? 'id_':'') 
                + `/${targetURL.url}`;
    }

    async matchLive2Archive(url, row, col, ts=null) {
        if (skipURL(url))
            return null;
        console.log("Querying", url);
        const idURL = await this.getResourceURL(url, true, ts);
        console.log("Fetching", idURL, row, col);
        // Collect response
        let origFile, origMime;
        if (!(idURL in this.response_cache)) {
            origFile = await fetch(idURL);
            origMime = origFile.headers.get('content-type');
            origFile = await origFile.text();
            this.response_cache[idURL] = [origFile, origMime];
        }
        origFile = this.response_cache[idURL][0];
        origMime = this.response_cache[idURL][1];
        // Parse file
        let origJSP = null;
        if (!(origFile in this.jsparse_cache)) {
            origJSP = new jsparse.JSParser(origFile, origMime);
            this.jsparse_cache[origFile] = origJSP;
        }
        origJSP = this.jsparse_cache[origFile];
        // Find path
        const origPos = jsparse.rowCol2Pos(origFile, [row, col]);
        const origPath = origJSP.findPath(origPos, false);
        const origText = origJSP.getTextFromPath(origPath, origPos);
        

        // Archive
        const archiveURL = await this.getResourceURL(url, false, ts);
        // Collect response
        let archiveFile, archiveMime;
        if (!(archiveURL in this.response_cache)) {
            archiveFile = await fetch(archiveURL);
            archiveMime = archiveFile.headers.get('content-type');
            archiveFile = await archiveFile.text();
            this.response_cache[archiveURL] = [archiveFile, archiveMime];
        }
        archiveFile = this.response_cache[archiveURL][0];
        archiveMime = this.response_cache[archiveURL][1];
        // Parse file
        let archiveJSP = null;
        if (!(archiveFile in this.jsparse_cache)) {
            archiveJSP = new jsparse.JSParser(archiveFile, archiveMime);
            this.jsparse_cache[archiveFile] = archiveJSP;
        }
        archiveJSP = this.jsparse_cache[archiveFile];
        // Find path
        let archivePos = archiveJSP.findPos(origPath, true);
        archivePos.start = calibrateStart(archiveFile, archivePos.start, archivePos.end, origText);

        return {
            archiveURL: archiveURL, 
            position: {
                start: jsparse.pos2RowCol(archiveFile, archivePos.start),
                end: jsparse.pos2RowCol(archiveFile, archivePos.end)
            },
            originalText: origText, 
            archiveText: archiveJSP.getTextFromPos(archivePos.start, archivePos.end)
        };
    }
}

async function testMatchLive2Archive () {
    // Run as node matchArchive.js --hostname "http://localhost:8080" -a test
    const testcases = [
        // {
        //     url: 'https://www.google.com/xjs/_/js/k=xjs.hd.en.1HjHF-v3j4c.O/am=AAAAAAAAAAAAAAAAAAAAAAAgAAAAQIIGwiEAGyAAAAAADJAAAgACGAGiUAAOABQEPJQJAACYAIEhMJIAUgSeSQAAYAKqAAIAAAAAACAYIAog8IAAAAB0AAABigAMQBCgAAIAAACQB4DgABhEEAAAAAAAAAAAAIAAEgTDBQlAQQABAAAAAAAAAAAAgJQ0UWEY/d=1/ed=1/dg=2/br=1/rs=ACT90oGtwIuuNKuEq3zO2xRkTPeKD_tc_Q/ee=cEt90b:ws9Tlc;qddgKe:x4FYXe,d7YSfd;yxTchf:KUM7Z;dtl0hd:lLQWFe;eHDfl:ofjVkb;qaS3gd:yiLg6e;nAFL3:NTMZac,s39S4;oGtAuc:sOXFj;iFQyKf:vfuNJf,QIhFr;SNUn3:ZwDk9d,x8cHvb;io8t5d:sgY6Zb;Oj465e:KG2eXe,KG2eXe;Erl4fe:FloWmf,FloWmf;JsbNhc:Xd8iUd;sP4Vbe:VwDzFe;kMFpHd:OTA3Ae;uY49fb:COQbmf;Pjplud:PoEs9b,EEDORb;QGR0gd:Mlhmy;a56pNe:JEfCwb;Me32dd:MEeYgc;wR5FRb:TtcOte,O1Gjze;pXdRYb:JKoKVe;dIoSBb:ZgGg9b;EmZ2Bf:zr1jrb;NSEoX:lazG7b;eBAeSb:Ck63tb;WCEKNd:I46Hvd;wV5Pjc:L8KGxe;EVNhjf:pw70Gc;sTsDMc:kHVSUb;wQlYve:aLUfP;zOsCQe:Ko78Df;KcokUb:KiuZBf;kbAm9d:MkHyGd;g8nkx:U4MzKc;YV5bee:IvPZ6d;pNsl2d:j9Yuyc;EnlcNd:WeHg4;BjwMce:cXX2Wb;KpRAue:Tia57b;jY0zg:Q6tNgc;aZ61od:arTwJ;yGxLoc:FmAr0c;NPKaK:SdcwHb;LBgRLc:XVMNvd,SdcwHb;UyG7Kb:wQd0G;LsNahb:ucGLNb;w9w86d:dt4g2b;vfVwPd:lcrkwe;RDNBlf:zPRCJb;coJ8e:KvoW8;oSUNyd:fTfGO,fTfGO,pnvXVc;SMDL4c:fTfGO,pnvXVc;lzgfYb:PI40bd;qZx2Fc:j0xrE;IoGlCf:b5lhvb;w4rSdf:XKiZ9;h3MYod:cEt90b;eO3lse:nFClrf;zaIgPb:Qtpxbd;HMDDWe:G8QUdb;ShpF6e:N0pvGc;k2Qxcb:XY51pe;IBADCc:RYquRb;pKJiXd:VCenhc;rQSrae:C6D5Fc;kCQyJ:ueyPK;EABSZ:MXZt9d;qavrXe:zQzcXe;TxfV6d:YORN0b;UDrY1c:eps46d;F9mqte:UoRcbe;GleZL:J1A7Od;Nyt6ic:jn2sGd;JXS8fb:Qj0suc;w3bZCb:ZPGaIb;VGRfx:VFqbr;G0KhTb:LIaoZ;XUezZ:sa7lqb;aAJE9c:WHW6Ef;V2HTTe:RolTY;Wfmdue:g3MJlb;imqimf:jKGL2e;BgS6mb:fidj5d;gtVSi:ekUOYd;KQzWid:ZMKkN;UVmjEd:EesRsb;z97YGf:oug9te;AfeaP:TkrAjf;eBZ5Nd:audvde;CxXAWb:YyRLvc;VN6jIc:ddQyuf;OgagBe:cNTe0;SLtqO:Kh1xYe;tosKvd:ZCqP3;VOcgDe:YquhTb;uuQkY:u2V3ud;WDGyFe:jcVOxd;trZL0b:qY8PFe;VxQ32b:k0XsBb;DULqB:RKfG5c;Np8Qkd:Dpx6qc;bcPXSc:gSZLJb;cFTWae:gT8qnd;gaub4:TN6bMe;xBbsrc:NEW1Qc;DpcR3d:zL72xf;hjRo6e:F62sG;pj82le:mg5CW;dLlj2:Qqt3Gf;oUlnpc:RagDlc;Q1Ow7b:x5CSu;bFZ6gf:RsDQqe;ESrPQc:mNTJvc;R9Ulx:CR7Ufe;KOxcK:OZqGte;G6wU6e:hezEbd;VsAqSb:PGf2Re;okUaUd:wItadb;ZWEUA:afR4Cf;U96pRd:FsR04;heHB1:sFczq;Fmv9Nc:O1Tzwc;hK67qb:QWEO5b;BMxAGc:E5bFse;R4IIIb:QWfeKf;whEZac:F4AmNb;tH4IIe:Ymry6;lkq0A:JyBE3e;daB6be:lMxGPd;LEikZe:byfTOb,lsjVmc/m=cdos,hsm,jsa,mb4ZUb,d,csi,cEt90b,SNUn3,qddgKe,sTsDMc,dtl0hd,eHDfl',
        //     row: 2107,
        //     col: 308
        // },
        // {
        //     url: 'https://www.google.com/',
        //     row: 6,
        //     col: 1695
        // },
        // {
        //     url: 'https://www.google.com/',
        //     row: 106,
        //     col: 211
        // },
        // {
        //     url: "https://static.ctctcdn.com/js/signup-form-widget/current/signup-form-widget.min.js",
        //     row: 0,
        //     col: 3122
        // },
        {
            url: "https://eta.lbl.gov/sites/default/files/js/js_QHqjxhGPGgZFwOfW92tmrVpssmC1sbO0zDG4TgLmaEI.js",
            row: 145,
            col: 8
        },
        {
            url: "https://eta.lbl.gov/sites/default/files/js/js_xiz34GyORQd8IWoIOUts3xRufFEzuu-9CX1VbFroHcI.js",
            row: 379,
            col: 6
        }
    ]
    const archiveMatcher = new ArchiveMatcher();
    for (const testcase of testcases) {
        const archiveMatch = await archiveMatcher.matchLive2Archive(testcase.url, testcase.row, testcase.col);
        console.log(archiveMatch);
        console.log(archiveMatch.originalText == archiveMatch.archiveText);
    }
}

/**
 * 
 * @param {Object} liveWriteStacks: 
 * [
 *   {
 *     writeID: String,
 *       stackInfo: [
 *       {
 *         description: "",
 *         callFrames: [{Actual Frame}]
 *       }
 *   }
 * ] 
 * @param {String} timestamp 
 */
async function transformLiveWriteStacks(liveWriteStacks, timestamp) {
    let archiveWriteStacks = [];
    let archiveMatcher = new ArchiveMatcher();
    for (const write of liveWriteStacks) {
        let archiveWrite = {writeID: write.writeID, stackInfo: []};
        for (const stack of write.stackInfo) {
            let archiveStack = {
                description: stack.description ?? 'no description', 
                callFrames: []
            }
            for (const frame of stack.callFrames) {
                const archiveFrame = await archiveMatcher.matchLive2Archive(frame.url, frame.lineNumber, frame.columnNumber, timestamp);
                if (!archiveFrame)
                    continue;
                archiveStack.callFrames.push({
                    live_url: frame.url,
                    // live_text: frame.text,
                    archive_url: archiveFrame.archiveURL,
                    // archive_text: archiveFrame.archiveText,
                    archive_start: archiveFrame.position.start,
                    archive_end: archiveFrame.position.end
                });
            }
            archiveWrite.stackInfo.push(archiveStack);
        }
        archiveWriteStacks.push(archiveWrite);
    }
    return archiveWriteStacks;
}

const liveWriteStacks = JSON.parse(fs.readFileSync(`${dirname}/${filename}_writeStacks.json`, 'utf8'));
transformLiveWriteStacks(liveWriteStacks, timestamp).then((archiveWriteStacks) => {
    fs.writeFileSync(`${dirname}/${filename}_archiveWriteStacks.json`, JSON.stringify(archiveWriteStacks, null, 2));
});

// testMatchLive2Archive();

module.exports = {
    ArchiveMatcher,
    transformLiveWriteStacks
}