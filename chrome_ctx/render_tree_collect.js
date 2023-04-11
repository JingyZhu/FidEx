/* 
    Collect render tree of current HTML
    Using JS to collect simulated render tree by check each node's dimension
*/

_render_tree = {};

function _outOfViewport(dimension) {
    invisible = dimension.width === 0 || dimension.height === 0;
    leftOut = dimension.right <= 0;
    // rightOut = dimension.left >= window.innerWidth;
    topOut = dimension.bottom <= 0;
    // bottomOut = dimension.top >= window.innerHeight;
    // return invisible || leftOut || rightOut || topOut || bottomOut;
    return invisible || leftOut || topOut;
}

// dfs through the DOM tree
function _dfs(node, useHTML=false) {
    let children = [];
    let nodeInfo = null;
    let dimension = node.getBoundingClientRect();
    const ovp = _outOfViewport(dimension);
    if (!ovp) {
        dimension = {left: dimension.left, top: dimension.top, width: dimension.width, height: dimension.height}
        nodeInfo = {
            name: node.nodeName,
            xpath: getDomXPath(node),
            dimension: dimension,
            // children: children,
        };
        if (useHTML)
            nodeInfo.html = node.outerHTML;
        // else
        //     nodeInfo.element = node;
    }

    if (node.childNodes.length > 0) {
        for (let child of node.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                childInfo = _dfs(child);
                children = children.concat(childInfo);
            } else if (child.nodeType === Node.TEXT_NODE && !ovp && child.textContent.trim() !== "") {
                children.push({
                    name: node.nodeName,
                    dimension: null,
                    children: [],
                    text: child.textContent
                });
            }
        }
    }
    if (nodeInfo != null){
        nodeInfo.children = children;
        return [nodeInfo];
    }
    else
        return children;
}

_render_tree = _dfs(document.body);