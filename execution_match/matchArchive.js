const fs = require('fs');
const { program } = require('commander');
const fetch = require('node-fetch');
const jsparse = require('./JSParse');

program
    .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
    .option('-f --file <filename>', 'Filename prefix', 'dimension')
    .option('-a --archive <Archive>', 'Archive list to record the page', 'test')
    .option('--hostname <Hostname>', "Hostname where archive system is running")

program.parse();
const options = program.opts();
const dirname = options.dir;
const filename = options.file;
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

async function getResourceURL(url, hasID=false, ts=null) {
    // Request to cdx server for ts
    let r = await fetch(`${hostname}/${archive}/cdx?url=${url}&output=json`);
    r = await r.text();
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

async function matchLive2Archive(url, row, col, ts=null) {
    const idURL = await getResourceURL(url, true, ts);
    let origFile = await fetch(idURL);
    // Collect response
    const origMime = origFile.headers.get('content-type');
    origFile = await origFile.text();
    // Parse file
    const origJSP = new jsparse.JSParser(origFile, origMime);
    // Find path
    const origPos = jsparse.rowCol2Pos(origFile, [row, col]);
    const origPath = origJSP.findPath(origPos, false);
    const lastNode = origPath.astpath[origPath.astpath.length-1].node;
    console.log("Original JS Text:", origJSP.getText(lastNode))
    

    const archiveURL = await getResourceURL(url, false, ts);
    let archiveFile = await fetch(archiveURL);
    // Collect response
    const archiveMime = archiveFile.headers.get('content-type');
    archiveFile = await archiveFile.text();
    // Parse file
    const archiveJSP = new jsparse.JSParser(archiveFile, archiveMime);
    // Find path
    const archivePos = archiveJSP.findPos(origPath, true);
    console.log("Archive JS Text:", archiveJSP.getText(archivePos.start, archivePos.end));
    
    return {archiveURL: archiveURL, position: archivePos};
}

(async () => {
    // const fileURL = 'https://www.google.com/xjs/_/js/k=xjs.hd.en.mNC3044ZyA4.O/am=AAAAAAAAAAAAAAAAAAAAAAAQAAAAIEED4RCADRAAEAAADJAAAgACSAGiEAAOAAQCHsoEAACYAIEhMCqAlMAzCQAATEAVQAAAAAAAAAgGRAEEHhAAAIAOACBAIwADEAQUQAAAAADyACA4AAYRBAAAAAAAAAAAACCABMFwQQJQEEAAAAAAAAAAAAAAICVNVBgG/d=1/ed=1/dg=2/br=1/rs=ACT90oGSLudbwnFle4rv9N9R2H5Tynsd7w/ee=cEt90b:ws9Tlc;qddgKe:x4FYXe,d7YSfd;yxTchf:KUM7Z;dtl0hd:lLQWFe;eHDfl:ofjVkb;qaS3gd:yiLg6e;nAFL3:NTMZac,s39S4;oGtAuc:sOXFj;iFQyKf:vfuNJf,QIhFr;SNUn3:ZwDk9d,x8cHvb;io8t5d:sgY6Zb;Oj465e:KG2eXe,KG2eXe;Erl4fe:FloWmf,FloWmf;JsbNhc:Xd8iUd;sP4Vbe:VwDzFe;kMFpHd:OTA3Ae;uY49fb:COQbmf;Pjplud:PoEs9b,EEDORb;QGR0gd:Mlhmy;a56pNe:JEfCwb;Me32dd:MEeYgc;wR5FRb:TtcOte,O1Gjze;pXdRYb:JKoKVe;dIoSBb:ZgGg9b;EmZ2Bf:zr1jrb;NSEoX:lazG7b;eBAeSb:Ck63tb;WCEKNd:I46Hvd;wV5Pjc:L8KGxe;EVNhjf:pw70Gc;sTsDMc:kHVSUb;wQlYve:aLUfP;zOsCQe:Ko78Df;KcokUb:KiuZBf;kbAm9d:MkHyGd;g8nkx:U4MzKc;YV5bee:IvPZ6d;pNsl2d:j9Yuyc;EnlcNd:WeHg4;BjwMce:cXX2Wb;KpRAue:Tia57b;jY0zg:Q6tNgc;aZ61od:arTwJ;yGxLoc:FmAr0c;NPKaK:SdcwHb;LBgRLc:XVMNvd,SdcwHb;UyG7Kb:wQd0G;LsNahb:ucGLNb;w9w86d:dt4g2b;vfVwPd:lcrkwe;RDNBlf:zPRCJb;coJ8e:KvoW8;oSUNyd:fTfGO,fTfGO,pnvXVc;SMDL4c:fTfGO,pnvXVc;lzgfYb:PI40bd;qZx2Fc:j0xrE;IoGlCf:b5lhvb;w4rSdf:XKiZ9;h3MYod:cEt90b;eO3lse:nFClrf;zaIgPb:Qtpxbd;HMDDWe:G8QUdb;ShpF6e:N0pvGc;k2Qxcb:XY51pe;IBADCc:RYquRb;pKJiXd:VCenhc;rQSrae:C6D5Fc;kCQyJ:ueyPK;EABSZ:MXZt9d;qavrXe:zQzcXe;TxfV6d:YORN0b;UDrY1c:eps46d;F9mqte:UoRcbe;GleZL:J1A7Od;Nyt6ic:jn2sGd;JXS8fb:Qj0suc;w3bZCb:ZPGaIb;VGRfx:VFqbr;G0KhTb:LIaoZ;XUezZ:sa7lqb;aAJE9c:WHW6Ef;V2HTTe:RolTY;Wfmdue:g3MJlb;imqimf:jKGL2e;BgS6mb:fidj5d;gtVSi:ekUOYd;KQzWid:ZMKkN;UVmjEd:EesRsb;z97YGf:oug9te;AfeaP:TkrAjf;eBZ5Nd:audvde;CxXAWb:YyRLvc;VN6jIc:ddQyuf;OgagBe:cNTe0;SLtqO:Kh1xYe;tosKvd:ZCqP3;VOcgDe:YquhTb;uuQkY:u2V3ud;WDGyFe:jcVOxd;trZL0b:qY8PFe;VxQ32b:k0XsBb;DULqB:RKfG5c;Np8Qkd:Dpx6qc;bcPXSc:gSZLJb;cFTWae:gT8qnd;gaub4:TN6bMe;xBbsrc:NEW1Qc;DpcR3d:zL72xf;hjRo6e:F62sG;pj82le:mg5CW;dLlj2:Qqt3Gf;oUlnpc:RagDlc;Q1Ow7b:x5CSu;bFZ6gf:RsDQqe;ESrPQc:mNTJvc;R9Ulx:CR7Ufe;KOxcK:OZqGte;G6wU6e:hezEbd;VsAqSb:PGf2Re;okUaUd:wItadb;ZWEUA:afR4Cf;U96pRd:FsR04;heHB1:sFczq;Fmv9Nc:O1Tzwc;hK67qb:QWEO5b;BMxAGc:E5bFse;R4IIIb:QWfeKf;whEZac:F4AmNb;tH4IIe:Ymry6;lkq0A:JyBE3e;daB6be:lMxGPd;LEikZe:byfTOb,lsjVmc/m=cdos,hsm,jsa,mb4ZUb,d,csi,cEt90b,SNUn3,qddgKe,sTsDMc,dtl0hd,eHDfl';
    // const row = 2100;
    // const col = 308;

    const fileURL = 'https://www.google.com/';
    const row = 6;
    const col = 2477;
    const archiveMatch = await matchLive2Archive(fileURL, row, col);
    console.log(archiveMatch);
})()