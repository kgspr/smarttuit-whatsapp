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

// WhatsApp webhook response
app.post('/wa', authenticateBearer, async (req, res) => {
    try {
        return res.status(200).json(req.body)
        const { to, message } = req.body

        if(message.toLowerCase().includes('zoom')) return res.status(200).json({
  "type": "text",
  "text": {
    "preview_url": true,
    "body": "https://zoom.us"
  }
        })

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
