/**
 * Clear all browser's storage with UI method
 */

function deletaData() {
    try {
        const settingBasicPage = document.querySelector("body > settings-ui").shadowRoot
                                .querySelector("#main").shadowRoot
                                .querySelector("settings-basic-page").shadowRoot
                                .querySelector("#basicPage")
        // Find  settings-section that has section="privacy"
        const deleteButton = settingBasicPage.querySelector("settings-section[section='privacy'] > settings-privacy-page").shadowRoot
                                .querySelector("settings-clear-browsing-data-dialog").shadowRoot
                                .querySelector("#clearButton");
        deleteButton.click();
        return "Success";
    } catch (e) {
        return e.toString();}
    
}