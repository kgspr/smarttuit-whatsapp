import express from 'express'
import dotenv from 'dotenv'
import fetch from 'node-fetch'

dotenv.config()

const app = express()
app.use(express.json())

// Bearer token middleware
const authenticateBearer = (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Missing or invalid Authorization header',
        })
    }

    const token = authHeader.split(' ')[1]

    if (token !== process.env.TOKEN) {
        return res.status(403).json({
            success: false,
            message: 'Invalid bearer token',
        })
    }

    next()
}

// Fetch student data
const studentData = async (phone) => {
    try {
        const response = await fetch(
            `https://lms.eu1.storap.com/flows/trigger/7569a48f-1732-4373-ae98-d942a1440ab5?phone=${phone}`
        )

        if (!response.ok) {
            throw new Error('Failed to fetch student data')
        }

        // Change to .text() if your flow returns text
        return await response.json()
    } catch (err) {
        console.error('studentData error:', err.message)
        return null
    }
}

// WhatsApp webhook
app.post('/wa', authenticateBearer, async (req, res) => {
    try {
        const entry = req.body?.entry?.[0]
        const change = entry?.changes?.[0]
        const value = change?.value
        const messages = value?.messages

        // Always ACK Meta
        if (!messages || !Array.isArray(messages)) {
            return res.status(200).send('EVENT_RECEIVED')
        }

        const messageText =
            messages[0]?.text?.body?.toLowerCase() || ''

        const from = messages[0]?.from

        if (messageText.includes('me')) {
            const student = await studentData(from)
            console.log('Student:', student)
        }

        if (messageText.includes('zoom')) {
            console.log('Send Zoom link')
        }

        console.log('Incoming message:', messageText)

        return res.status(200).send('EVENT_RECEIVED')
    } catch (err) {
        console.error(err)
        return res.status(200).send('EVENT_RECEIVED')
    }
})

app.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on port ${process.env.PORT}`)
})
