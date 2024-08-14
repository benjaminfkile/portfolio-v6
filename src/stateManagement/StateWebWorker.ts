// Class to create a web worker from a blob URL created from the worker's code string

class StateWebWorker {
    constructor(worker: { toString: () => any }) {
        const code = worker.toString()
        const blob = new Blob(["(" + code + ")()"])
        return new Worker(URL.createObjectURL(blob))
    }
}

export default StateWebWorker