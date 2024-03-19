/* 
    Collect render tree of current HTML
    Using JS to collect simulated render tree by check each node's dimension
*/

_render_tree = {};

function _outOfViewport(dimension) {
    invisible = dimension.width === 0 || dimension.height === 0;
    // * Filter elements that only take a single pixel (essentially not visible)
    invisible = invisible || (dimension.width <=1 && dimension.height <= 1)
    leftOut = dimension.right <= 0;
    // rightOut = dimension.left >= window.innerWidth;
    topOut = dimension.bottom <= 0;
    // bottomOut = dimension.top >= window.innerHeight;
    // return invisible || leftOut || rightOut || topOut || bottomOut;
    return invisible || leftOut || topOut;
}

/**
 * dfs through the DOM tree
 * @param {Node.ELEMENT_NODE} node 
 * @returns {Array} Array of node info
 */
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

    if (node.childNodes.length > 0 && node.tagName != 'IFRAME') {
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
_render_tree_info = []
function getNodeText(node) {
    if (node.nodeType === Node.ELEMENT_NODE){
        node = _normalSRC(node);
        let tag = node.outerHTML;
        const innerHTML = node.innerHTML;
        if (innerHTML !== "") {
            const end = tag.lastIndexOf(innerHTML);
            tag = tag.slice(0, end)
        } else {
            tag = tag.replace(/<\/.*?>/g, "");
        }
        return tag.replace(/\n/g, "");
    } else if (node.nodeType === Node.TEXT_NODE){
        return node.textContent;
    } else
        return null;
}

function getNodeExtraAttr(node){
    let attrs = {};
    if (node.nodeType === Node.ELEMENT_NODE){
        let targetAttr = ['complete', 'currentSrc']
        for (let attr of targetAttr){
            if (attr in node){
                attrs[attr] = node[attr];
                // console.log(node, attr)
                // if (node[attr] == "")
                    // console.log(node)
            }
        }
    }
    return attrs;
}

/**
 * Serialize dfs'ed render tree to text version that can be saved
 */
function _serializeRenderTree() {
    let counter = 0;
    let _dfsHelper = function(node, depth=0) {
        const nodeText = getNodeText(node.node);
        if (nodeText != null){
            _render_tree_info.push({
                text: nodeText,
                xpath: getDomXPath(node.node),
                dimension: node.dimension,
                extraAttr: getNodeExtraAttr(node.node),
                depth: depth,
            });
            counter += 1;
        }
        for (let child of node.children) {
            _dfsHelper(child, depth+1);
        }
    }
    for (let node of _render_tree) {
        _dfsHelper(node, 0);
    }
}

// _render_tree = _dfsVisible(document.body);
// _serializeRenderTree();