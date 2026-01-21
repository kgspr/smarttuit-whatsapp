import express from 'express'
import dotenv from 'dotenv'

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
        const { to, messages } = req.body || {}

        if (!messages || !Array.isArray(messages)) {
            return res.status(200).send('EVENT_RECEIVED')
        }

        const strMessage = JSON.stringify(messages).toLowerCase()

        if (strMessage.includes('me')) {
            const student = await studentData(to)
            return res.status(200).json({
                "type": "text",
                "text": {
                    "preview_url": true,
                    "body": student?.data?.student?.name || ''
                }
            })
        }

        if (strMessage.includes('zoom')) {
            return res.status(200).json({
                "type": "text",
                "text": {
                    "preview_url": true,
                    "body": "https://zoom.us"
                }
            })
        }

        return res.status(200).json({
            type: "interactive",
            interactive: {
                type: "button",
                body: {
                    text: "📝 Please choose one option below:"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "btn_option_2",
                                title: "Option 2"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "btn_option_3",
                                title: "Option 3"
                            }
                        }
                    ]
                }
            }
        })

    } catch (err) {
        console.error(err)
        return res.status(500).json({
            success: false,
            error: err.message
        })
    }
})

app.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on port ${process.env.PORT}`)
})
