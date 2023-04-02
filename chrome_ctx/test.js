const callback = (mutationList, observer) => {
    console.log('Mutation detected');
    console.log(mutationList);
};

const options = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true

}

let m = new MutationObserver(callback);
m.observe(document, options);

p = document.createElement('p');
p.textContent = "AHA";
body = document.body;
body.append(p);