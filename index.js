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

const zoomMeetingData = async (phone) => {
    try {
        const response = await fetch(
            `https://lms.eu1.storap.com/items/online_classes_students?filter[phone][_eq]=${encodeURIComponent(phone)}&fields=link,online_classes_id.class.name&sort=-id`,
            {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer _bRSdfALKVbionFG3jFi_L4JV5e8M68s',
                    'Content-Type': 'application/json'
                }
            }
        )

        if (!response.ok) {
            throw new Error('Failed to fetch zoom data')
        }

        // Change to .text() if your flow returns text
        return await response.json()
    } catch (err) {
        console.error('zoomData error:', err.message)
        return null
    }
}

const dataNotFound = (message) => {
    return {
        "type": "text",
        "text": {
            "body": message
        }
    }
}

// WhatsApp webhook
app.post('/wa', authenticateBearer, async (req, res) => {
    try {
        const { to, messages } = req.body || {}

        if (!messages || !Array.isArray(messages)) {
            return res.status(200).send('EVENT_RECEIVED')
        }

        const strMessage = JSON.stringify(messages?.[0]?.text?.body || messages?.[0]?.interactive?.button_reply?.id ).toLowerCase()

        if (strMessage.includes('me')) {
            const student = await studentData(to);
            if (!student?.data) return res.status(200).json(dataNotFound("Sorry, this phone number is not vaild!"));
            return res.status(200).json({
                "type": "text",
                "text": {
                    "preview_url": true,
                    "body": student?.data?.student?.name || ''
                }
            })
        }

        if (strMessage.includes('zoom')) {
            const zoom = await zoomMeetingData(to);
            if (zoom?.data?.length == 0) return res.status(200).json(dataNotFound("You haven't zoom meetings!"));
            let meeting_links = ``
            zoom?.data?.forEach(meeting => {
                meeting_links += `\n\n*${meeting?.online_classes_id?.class?.name || 'Meeting'}*\n${meeting.link}`
            });
            return res.status(200).json({
                "type": "text",
                "text": {
                    "preview_url": true,
                    "body": `*Zoom Meetings*${meeting_links}` //"https://zoom.us"
                }
            })
        }

        return res.status(200).json({
            type: "interactive",
            interactive: {
                type: "button",
                body: {
                    text: "*Welcome to Student Portal*\n\nWhat you want to do?\nඔබට අවශ්‍ය දේ පහති​න් තෝරන්​න\n\n_Powered by SmartTuit®_\n📝 Hi! Select what you want to do?"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "zoom",
                                title: "Join Online Class"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "me",
                                title: "About Me"
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
