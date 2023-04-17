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
function _dfsVisible(node) {
    let children = [];
    let nodeInfo = null;
    let dimension = node.getBoundingClientRect();
    const ovp = _outOfViewport(dimension);
    if (!ovp) {
        dimension = {left: dimension.left, top: dimension.top, width: dimension.width, height: dimension.height}
        nodeInfo = {
            name: node.nodeName,
            node: node,
            dimension: dimension,
        };
    }

    if (node.childNodes.length > 0) {
        for (let child of node.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                childInfo = _dfsVisible(child);
                children = children.concat(childInfo);
            } else if (child.nodeType === Node.TEXT_NODE && !ovp && child.textContent.trim() !== "") {
                children.push({
                    name: child.nodeName,
                    node: child,
                    dimension: null,
                    children: []
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

_render_tree = _dfsVisible(document.body);

function _normalSRC(node){
    // const _attrs = ['src', 'href', 'action'];
    // Get all attributes of the node
    let _attrs = [];
    for (let i = 0; i < node.attributes.length; i++){
        _attrs.push(node.attributes[i].name);
    }
    for (let attr of _attrs){
        if (!node.hasAttribute(attr))
            continue;
        let relVal = node.getAttribute(attr);
        let absVal = node[attr]
        if (typeof absVal === 'string' 
        && (relVal.startsWith('/') || relVal.startsWith('.'))
        && !relVal.startsWith('//')){
            try{
                node[attr] = node[attr];
            } catch {}
        }
    }
    return node;
}

// Convert _render_tree's nodes to their tag texts within <>
_render_tree_text = []
_node_info = {}
function getNodeText(node) {
    if (node.node.nodeType === Node.ELEMENT_NODE){
        const regex = /<(.|\n|\r)*?>/g;
        node.node = _normalSRC(node.node);
        let tag = node.node.outerHTML.match(regex)[0];
        return tag.replace(/\n/g, '');
    } else if (node.node.nodeType === Node.TEXT_NODE){
        return node.node.textContent;
    } else
        return null;
}

function getNodeTextXpath(node, depth=0) {
    if (node.node.nodeType === Node.ELEMENT_NODE){
        let xpath = getDomXPath(node.node).slice(2);
        xpath = xpath.split('/').slice(depth+1)
        xpath = xpath.join('/')
        return `${xpath}: ${JSON.stringify(node.dimension)}` 
    } else if (node.node.nodeType === Node.TEXT_NODE){
        return node.node.textContent;
    } else
        return null;
}

function _serializeRenderTree() {
    const prefix = '  '
    let _dfsHelper = function(node, depth=0) {
        const nodeText = getNodeText(node);
        if (nodeText != null){
            _render_tree_text.push(prefix.repeat(depth) + nodeText);
            _node_info[nodeText] = {
                xpath: getDomXPath(node.node),
                dimension: node.dimension,
            };
        }
        for (let child of node.children) {
            _dfsHelper(child, depth+1);
        }
    }
    for (let node of _render_tree) {
        _dfsHelper(node, 0);
    }
}

_serializeRenderTree();