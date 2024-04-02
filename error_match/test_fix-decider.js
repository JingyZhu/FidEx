const assert = require('assert');
const fixDecider = require('./fix-decider');
const errorInspector = require('../revert_rewrite/error-inspector');


function testDecide() {
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
}

function testDecideInteract1() {
    let result = {};
    let event = {};
    let decider = null;

    result = {
        fixedIdx: -1,
        events: {
          path: "/html[1]/body[1]",
          events: {
            click: [
              "0"
            ]
          },
        },
        results: [
          {
            type: "exceptions",
            exceptions: []
          },
          {
            type: "fidelity",
            exception: "Base",
            fixed: false,
            fixedID: null,
            fixedExcep: false,
            fixedExcepID: null,
            skipped: true,
            reloadCount: 1
          }
        ]
    }
    decider = new fixDecider.FixDecider();
    decider.parseInteractionResult(result);

    event = {
        path: "/html[1]/body[1]/div[1]",
        events: {
          click: [
            "0"
          ]
        },
    }
    assert.equal(decider.decideInteract(event).couldBeFixed, false);

    event = {
        path: "/html[1]/body[1]/div[1]",
        events: {
          click: [
            "1"
          ]
        },
    }
    assert.equal(decider.decideInteract(event).couldBeFixed, true);

    event = {
        path: "/html[1]/body[1]/div[1]",
        events: {
          click: [
            "0",
            "1"
          ]
        },
    }
    assert.equal(decider.decideInteract(event).couldBeFixed, true);

    event = {
        path: "/html[1]/body[2]/div[1]",
        events: {
          click: [
            "0"
          ]
        },
    }
    assert.equal(decider.decideInteract(event).couldBeFixed, true);

    event = {
        path: "/html[1]/body[1]/div[1]",
        events: {
          click: [
            "0"
          ],
          mouseover: [
            "0"
          ]
        },
    }
    assert.equal(decider.decideInteract(event).couldBeFixed, true);
}

function testDecideInteract2() {
    let result = {};
    let event = {};
    let decider = null;

    result = {
        fixedIdx: -1,
        events: {
          path: "/html[1]/body[1]/div[1]",
          events: {
            click: [
              "0"
            ]
          },
        },
        results: [
          {
            type: "exceptions",
            exceptions: []
          },
          {
            type: "fidelity",
            exception: "Base",
            fixed: false,
            fixedID: null,
            fixedExcep: false,
            fixedExcepID: null,
            skipped: true,
            reloadCount: 1
          }
        ]
    }
    decider = new fixDecider.FixDecider();
    decider.parseInteractionResult(result);

    event = {
        path: "/html[1]/body[2]/div[1]",
        events: {
          click: [
            "0"
          ]
        },
    }
    assert.equal(decider.decideInteract(event).couldBeFixed, false);
}

testDecideInteract2();