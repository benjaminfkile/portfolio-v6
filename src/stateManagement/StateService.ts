// stateService.ts
import mutate from './Mutate'
import StateWebWorker from './StateWebWorker'
import StateWebWorkerListener from './StateWebWorkerListener'
import state from './State'


// Store for all component subscriptions to state changes
const listeners: Map<string, Set<Function>> = new Map()

const stateService = {
    // Initialize a web worker for offloading state management tasks
    webWorker: new StateWebWorker(StateWebWorkerListener),
    // Current application state
    state: state,
    // Method to subscribe a callback to state changes of a specific state key
    subscribe: (stateKey: string, callback: Function): void => {
        if (!listeners.has(stateKey)) {
            listeners.set(stateKey, new Set())
        }
        listeners.get(stateKey)!.add(callback)
    },
    // Method to unsubscribe a callback from state changes of a specific state key
    unsubscribe: (stateKey: string, callback: Function): void => {
        if (listeners.has(stateKey)) {
            listeners.get(stateKey)!.delete(callback)
            if (listeners.get(stateKey)!.size === 0) {
                listeners.delete(stateKey)
            }
        }
    },
    // Method to update state and notify all subscribed components
    updateState: (stateKey: string, keys: Array<{ key: string, value: any }>) => {
        //@ts-ignore
        const updatedState = mutate(stateService.state[stateKey], keys)
        //@ts-ignore
        stateService.state[stateKey] = updatedState  // Ensures the state reference is updated
        //@ts-ignore
        stateService.webWorker.postMessage({ action: "updateState", payload: { stateKey, newState: updatedState } })

        // Notify all subscribers of the new state
        if (listeners.has(stateKey)) {
            listeners.get(stateKey)!.forEach(callback => callback(updatedState))
        }
    },
    // Method to manage subscription and state updates within components
    manageSubscriptionAndStateUpdate: (setState: React.Dispatch<React.SetStateAction<any>>, stateKey: string) => {
        const handleUpdate = (newState: any) => { // Changed from AppState to any for general use
            setState(newState)
        }

        // Subscribe to state updates
        stateService.subscribe(stateKey, handleUpdate)

        // Return a function to unsubscribe when the component unmounts
        return () => {
            stateService.unsubscribe(stateKey, handleUpdate)
        }
    }
}

export default stateService
