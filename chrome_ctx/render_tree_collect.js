/* 
    Collect render tree of current HTML
    Using JS to collect simulated render tree by check each node's dimension
*/

function _outOfViewport(dimension) {
    invisible = dimension.width === 0 || dimension.height === 0;
    // * Filter elements that only take a single pixel (essentially not visible)
    invisible = invisible || (dimension.width <=1 && dimension.height <= 1)
    // leftOut = dimension.right <= 0;
    // rightOut = dimension.left >= window.innerWidth;
    // topOut = dimension.bottom <= 0;
    // bottomOut = dimension.top >= window.innerHeight;
    // return invisible || leftOut || rightOut || topOut || bottomOut;
    // return invisible || leftOut || topOut;
    return invisible;
}

/**
 * dfs through the DOM tree
 * @param {Node.ELEMENT_NODE} node 
 * @returns {Array} Array of node info
 */
function dfsVisible(node) {
    let children = [];
    let nodeInfo = null;
    let dimension = null;
    // * Some node like iframe document does not have getBoundingClientRect
    dimension = node.getBoundingClientRect();
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
                childInfo = dfsVisible(child);
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

/**
 * dfs through the DOM tree, similar to dfsVisible but without viewport check
 * @param {Node.ELEMENT_NODE} node 
 * @returns {Array} Array of node info
 */
function dfsAll(node) {
    let children = [];
    let nodeInfo = null;
    let dimension = null;
    // * Some node like iframe document does not have getBoundingClientRect
    dimension = node.getBoundingClientRect();
    dimension = {left: dimension.left, top: dimension.top, width: dimension.width, height: dimension.height}
    nodeInfo = {
        name: node.nodeName,
        node: node,
        dimension: dimension,
    };

    if (node.childNodes.length > 0 && node.tagName != 'IFRAME') {
        for (let child of node.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                childInfo = dfsAll(child);
                children = children.concat(childInfo);
            } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== "") {
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
        return node.textContent.trim();
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
        // check for CSS animation attributes
        let cssStyle = window.getComputedStyle(node);
        const animation = cssStyle.animation;
        if (animation && !animation.startsWith('none'))
            attrs['animation'] = animation;
        const visibility = cssStyle.visibility;
        if (visibility && visibility !== 'visible')
            attrs['visibility'] = visibility;
    }
    return attrs;
}

/**
 * Serialize dfs'ed render tree to text version that can be saved
 * @param {Array} render_tree render_tree returned by dfsVisible or dfsAll
 */
function serializeRenderTree(render_tree) {
    let counter = 0;
    let render_tree_info = [] 
    let _dfsHelper = function(node, depth=0) {
        const nodeText = getNodeText(node.node);
        if (nodeText != null){
            render_tree_info.push({
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
    for (let node of render_tree) {
        _dfsHelper(node, 0);
    }
    return render_tree_info;
}

// render_tree = dfsVisible(document.body);
// render_tree_info = serializeRenderTree(render_tree);