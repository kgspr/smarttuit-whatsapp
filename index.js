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

        const strMessage = JSON.stringify(messages?.[0]?.text?.body || messages?.[0]?.interactive?.button_reply?.id).toLowerCase()

        if (strMessage.includes('cmd_me')) {
            const student = await studentData(to);
            if (!student?.length) return res.status(200).json(dataNotFound("Sorry, this phone number is not vaild!"));
            return res.status(200).json({
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        "text": 'Select',//`*${student?.data?.student?.name || ''}* (${student?.data?.student?.student_id || ''})`
                    },
                    action: {
                        buttons: [
                    // dynamic student buttons
                    ...students.map((account) => ({
                        type: "reply",
                        reply: {
                            id: `cmd_student_${account.id}`, // unique id
                            title: account.name || "Student"
                        }
                    })),

                    // static main menu button
                    {
                        type: "reply",
                        reply: {
                            id: "cmd_main_menu",
                            title: "Main Menu"
                        }
                    }
                        ]
                    }
                }
            })
        }

        if (strMessage.includes('cmd_zoom')) {
            const zoom = await zoomMeetingData(to);
            if (zoom?.data?.length == 0) return res.status(200).json(dataNotFound("You haven't zoom meetings!"));
            let meeting_links = ``
            zoom?.data?.forEach(meeting => {
                meeting_links += `\n\n*${meeting?.online_classes_id?.class?.name || 'Meeting'}*\n${meeting.link.replace('https://', '')}`
            });
            return res.status(200).json({
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        "text": `*Zoom Online Classes*${meeting_links}` //"https://zoom.us"
                    },
                    action: {
                        buttons: [
                            {
                                type: "reply",
                                reply: {
                                    id: "cmd_main_menu",
                                    title: "Main Menu"
                                }
                            }
                        ]
                    }
                }
            })
        }

        return res.status(200).json({
            type: "interactive",
            interactive: {
                type: "button",
                body: {
                    text: "👋 Hello!\n*Welcome to the Student Portal 😊*\n\n📝 Please choose an option below\nඔබට අවශ්‍ය දේ පහතින් තෝරන්න 👇\n\n_Powered by SmartTuit®_\n"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "cmd_zoom",
                                title: "Join Online Class"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "cmd_me",
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
