/*
    Diff liveweb html and archived html with html-differ
*/
const HtmlDiffer = require('html-differ').HtmlDiffer
const logger = require('html-differ/lib/logger');
const fs = require('fs')

const live_dir = "../recording/pageinfo/test"
const archive_dir = "../recording/pageinfo/test_archive"


live_html = fs.readFileSync(`${live_dir}/dimension.html`, 'utf-8')
archive_html = fs.readFileSync(`${archive_dir}/dimension.html`, 'utf-8')

live_html = "<div><a><p>AHA</p></a></div>"
archive_html = "<div>fff<p>AHA</p></div>"

var options = {
    ignoreAttributes: [],
    compareAttributesAsJSON: [],
    ignoreWhitespaces: true,
    ignoreComments: true,
    ignoreEndTags: false,
    ignoreDuplicateAttributes: false
};
htmlDiffer = new HtmlDiffer({})

let diff = htmlDiffer.diffHtml(archive_html, live_html)
console.log(diff)
// logger.logDiffText(diff, { charsAroundDiff: 40 });