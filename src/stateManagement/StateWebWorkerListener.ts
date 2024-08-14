// This file contains the logic that the web worker will execute.

//eslint-disable-next-line
export default () => {
    self.addEventListener("message", e => { // eslint-disable-line no-restricted-globals
        if (!e) return
        if(e.data.action === "updateState"){
            self.postMessage(e.data.payload)// eslint-disable-line no-restricted-globals
        }
    })
}