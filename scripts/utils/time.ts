export default function getTime(timeOffset: number) {
    const date = new Date()
    date.setHours(date.getHours() + timeOffset)
    return date
}