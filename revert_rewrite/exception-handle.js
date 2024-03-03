const reverter = require('./reverter');

function skipJS(url) {
    const skipKeywords = [
        'wombat.js'
    ]
    for (const keyword of skipKeywords) {
        if (url.includes(keyword))
            return true;
    }
    return false;
}

class ExceptionInfo {
    /**
     * 
     * @param {string} type from data.className
     * @param {string} description from data.description
     */
    constructor(type, description){
        this.type = type;
        this.description = description;
        this.frames = []; // [frame[var]]
    }

    addFrame(url, line, column) {
        this.frames.push({
            url: url,
            line: line,
            column: column,
            vars: []
        });
    }

    /**
     * 
     * @param {Runtime.PropertyDescriptor} property 
     * @param {Debugger.Scope.type} scopeType
     * @param {string} proxyType If the property is proxied, decide which type it is proxied on (window, document, etc...)
     */
    addVar(property, scopeType, proxyType) {
        let frameVar = this.frames[this.frames.length-1].vars;
        frameVar.push({
            name: property.name,
            scopeType: scopeType,
            proxyType: proxyType,
            value: property.value
        });
        console.log("Added var", frameVar[frameVar.length-1])
    }
}


class ExceptionInspector {
    /**
     * 
     * @param {Object} client created from page.target().createCDPSession() 
     */
    constructor(client){
        this.client = client;
        this.scriptInfo = {};
        this.exceptions = []
    }

    /**
     * Decide which type is the variable proxied on (window, document, etc...)
     */
    async _decideProxyType(variable, callFrame){
        if (!variable.value || !variable.value.description || !variable.value.description.startsWith('Proxy('))
            return null;
        let template = (name) => {
            let tocheck = ['window', 'document', 'location', 'opener', 'self', 'parent', 'frames', 'top'];
            let code = '';
            for (const check of tocheck) {
                code += `
                if (typeof ${check} === 'object' && Object.getPrototypeOf(${check}) === Object.getPrototypeOf(${name}))
                    return '${check}';
                `
            }
            code += 'return "Unknown";'
            code = `(() => {${code}})();`
            return code;
        }
        const result = await this.client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: callFrame.callFrameId,
            expression: template(variable.name)
        });
        return result.result.value;
    }

    async _recordException(params){
        const {callFrames, data} = params;
        let info = new ExceptionInfo(data.className, data.description);
        for (const frame of callFrames){
            const {location, scopeChain} = frame;
            const url = this.scriptInfo[location.scriptId].url;
            if (skipJS(url))
                continue;
            info.addFrame(url, location.lineNumber, location.columnNumber);
            
            for (const scope of scopeChain) {
                const {object, type} = scope;
                const properties = await this.client.send('Runtime.getProperties', {
                  objectId: object.objectId,
                });
                for (const varProp of properties.result){
                    const proxyType = await this._decideProxyType(varProp, frame);
                    info.addVar(varProp, type, proxyType);
                }
            }
        }
        this.exceptions.push(info);
    }
    /**
     * 
     * @param {string} type none, uncaught, caught, all
     */
    async setExceptionBreakpoint(type='uncaught'){
        this.client.on('Debugger.scriptParsed', async params => {
            // * First add the URL, since getting the source is async
            this.scriptInfo[params.scriptId] = {url: params.url, source: null};
            const {scriptSource} = await this.client.send('Debugger.getScriptSource', {scriptId: params.scriptId});
            this.scriptInfo[params.scriptId].sourc = scriptSource;
        });

        await this.client.send('Debugger.setPauseOnExceptions', {state: type});
        
        await this.client.removeAllListeners('Debugger.paused');
        this.client.on('Debugger.paused', async params => {
            await this._recordException(params);
            await this.client.send('Debugger.resume');
        });
    }

    getSource(url) {
        for (const info of Object.values(this.scriptInfo))
            if (info.url === url)
                return info.source;
    }
}

class ExceptionFixer {
    constructor(client, inspector){
        this.client = client;
        this.inspector = inspector;
    }

    _getProxifiedVars(variables) {
        let proxifiedVars = [];
        for (const variable of variables) {
            let {name, value, scopeType} = variable;
            // TODO: Currently very basic check, might need to do better check.
            if (value.description.startsWith('Proxy(')) 
                proxifiedVars.push({name, value, scopeType});
        }
        return proxifiedVars;
    }

    async fixException(exception){
        for (const frame of exception.frames){
            const source = this.inspector.getSource(frame.url);
            if (source == null) {
                console.log(`Cannot find source for ${frame.url}`);
                continue;
            }
            const revert = new reverter.Reverter(source);
            const startLoc = {line: frame.line+1, column: frame.column+1};
            
            const proxifiedVars = this._getProxifiedVars(frame.vars);
            // TODO: Construct variableType
            revert.revertVariable(startLoc, proxifiedVars);
        }
    }

    async reload() {
        await this.client.send('Page.reload');
    }
}


class ExceptionHandler {
    constructor(client){
        this.client = client;
        this.inspector = ExceptionInspector(client);
        this.fixer = ExceptionFixer(client, this.inspector);
    }

    async inspectRegister() {
        await this.inspector.setExceptionBreakpoint();
    }

    async fixFirstException() {
        
    }

}


module.exports = {
    ExceptionInspector
};