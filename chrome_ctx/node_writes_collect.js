/**
 * Collect write logs after loading the page.
 * Note: need to override Node write methods and setters using node_write_override.js
 */
__raw_write_log_processed = [];
__final_write_log = [];
__final_write_log_processed = [];
__recording_enabled = false;
// Normalize all href and src attributes in node
function _normalSRC(node){
    const _attrs = ['src', 'href', 'action'];
    const setSrcSet = (n) => {
        return; // * srcset seems to have bug for archive, not sure how broad the issue is
        // Change srcset to absolute path
        if (n.hasAttribute('srcset')){
            let srcset = n.getAttribute('srcset');
            let srcsetList = srcset.split(', ');
            let newSrcSet = [];
            for (const srcRes of srcsetList){
                const src = srcRes.split(' ')[0];
                let newSrc = new URL(src, window.location.href).href;
                newSrcSet.push(`${newSrc} ${srcRes.split(' ')[1]}`);
            }
            n.setAttribute('srcset', newSrcSet.join(', '));
        }
    }
    for (let attr of _attrs){
        if (node.hasAttribute(attr))
            node[attr] = node[attr];
        setSrcSet(node)
    }
    let allDescendants = node.querySelectorAll('*');
    for (let descendant of allDescendants){
        for (let attr of _attrs){
            if (descendant.hasAttribute(attr))
                descendant[attr] = descendant[attr];
        }
        setSrcSet(descendant)
    }
    return node;
}

function collect_writes(){
    // Process raw_args so that it can be stringified
    function process_args(raw_args) {
        let args = [];
        for (let arg of raw_args) {
            if (args == null || arg == undefined)
                continue
            if (arg instanceof Element) {
                arg = _normalSRC(arg);
                args.push(arg.outerHTML);
            } else if (arg instanceof Node) {
                if (arg.nodeName !== undefined)
                    args.push(arg.nodeName);
                else
                    args.push(arg.nodeType);
            } else { // Assme it is a string
                args.push(arg);
            }
        }
        return args;
    }

    for (const record of __raw_write_log) {
        args = process_args(record.args);
        if (record.method === 'setAttribute' && args[0] === 'src')
            args[1] = record.target.src;

        __raw_write_log_processed.push({
            xpath: getDomXPath(record.target, fullTree = true),
            method: record.method,
            arg: args
        })

        let currentDS = new DimensionSets();
        currentDS.recordDimension(record.target, record.args);
        // * Check if the dimension now is the same as before the write
        // * The reason for checking it now is to catch lazy loaded elements
        // * For example, if an image is written to the DOM, it might not be loaded immediately.
        if (record.beforeDS.isDimensionMatch(record.afterDS) && currentDS.isArgsDimensionMatch(record.beforeDS))
            continue
        __final_write_log.push(record);
        // Handle img src
        __final_write_log_processed.push({
            xpath: getDomXPath(record.target, fullTree = true),
            method: record.method,
            arg: args
        })
    }
}

collect_writes()
__recording_enabled = true;