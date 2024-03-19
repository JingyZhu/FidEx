const assert = require('assert');
const fixDecider = require('./fix-decider');
const errorInspector = require('../revert_rewrite/error-inspector');

let log = [];
let decider = null;
let exception = null;

log = [
    {
        type: "exceptions",
        exceptions: [
            {
                type: "SyntaxError",
                idx: -1,
                description: "SyntaxError: Unexpected token '}'",
                uncaught: true,
                url: "https://www.example.com"
            }
        ]
    },
    {
        type: "fidelity",
        exception: "SyntaxError",
        fixedExcep: true,
        fixedExcepID: 0
    }
]

decider = new fixDecider.FixDecider();
decider.parseFixResult(log);
assert.equal(decider.rules["SyntaxError: Unexpected token '}'"].couldBeFixed, true);


log = [
    {
        type: "exceptions",
        exceptions: [
            {
                type: "DOMException",
                idx: 0,
                description: "DOMException: Failed to execute 'webkitMatchesSelector' on 'Element': '[test!='']:sizzle' is not a valid selector.\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:69452\n    at l (http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:60041)\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:69414\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:69749\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:69981\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:103792",
                uncaught: false,
                url: "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1"
            }
        ]
    },
    {
        type: "fidelity",
        exception: 0,
        description: "DOMException: Failed to execute 'webkitMatchesSelector' on 'Element': '[test!='']:sizzle' is not a valid selector.",
        fixed: false,
        fixedExcep: false,
        fixedExcepID: null
    }
]

decider = new fixDecider.FixDecider();
decider.parseFixResult(log);
exception = new errorInspector.ExceptionInfo("DOMException", "DOMException: Failed to execute 'webkitMatchesSelector' on 'Element': '[test!='']:sizzle' is not a valid selector.", false);
assert.equal(decider.decide(exception).couldBeFixed, false);

log = [
    {
        type: "exceptions",
        exceptions: [
            {
                type: "DOMException",
                idx: 0,
                description: "DOMException: Failed to execute 'webkitMatchesSelector' on 'Element': '[test!='']:sizzle' is not a valid selector.\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:69452\n    at l (http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:60041)\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:69414\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:69749\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:69981\n    at http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1:15:103792",
                uncaught: false,
                url: "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725js_/http://myssaisanfrancisco.usajobs.gov/bundles/usaj-base?v=qeeXKJiCN9hHuUtUVS_6eUA5MZ4nNLdbrNZIxkAICec1"
            }
        ]
    }
]

exception = new errorInspector.ExceptionInfo("DOMException", "DOMException: Failed to execute 'webkitMatchesSelector' on 'Element': '[test!='']:sizzle' is not a valid selector.", false);
decider = new fixDecider.FixDecider();
decider.parseFixResult(log);
assert.equal(decider.decide(exception).couldBeFixed, true);