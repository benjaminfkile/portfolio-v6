// Function to immutably update the state based on an array of key-value pairs.
// It toggles boolean values if no value is provided, or sets the specified value otherwise.
// Strange thing can happen if you dont provide value with anything other than a boolean
const mutate = (state: any, keys: Array<{ key: string, value?: any }>) => {
    let newState = { ...state }
    keys.forEach(({ key, value }) => {
        newState[key] = value !== undefined ? value : !newState[key]
    })
    return newState
}

export default mutate