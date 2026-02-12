import express from 'express'
import dotenv from 'dotenv'
import crypto from 'crypto'
import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs";

dotenv.config()

const app = express()
app.use(express.json())

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const DIRECTUS_URL = "https://lms.eu1.storap.com";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function downloadWhatsAppMedia(message) {
    let media;
    let extension = "bin";

    if (message.type === "image") {
        media = message.image;
        extension = "jpg";
    } else if (message.type === "document") {
        media = message.document;
        extension = media.mime_type === "application/pdf" ? "pdf" : "bin";
    } else {
        throw new Error("Unsupported media type");
    }

    const mediaId = media.id;

    // 1. Get media URL
    const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${mediaId}`,
        {
            headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            },
        }
    );

    const metaJson = await metaRes.json();
    if (!metaJson.url) throw new Error("Failed to get media URL");

    // 2. Download binary
    const mediaRes = await fetch(metaJson.url, {
        headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
    });

    const buffer = Buffer.from(await mediaRes.arrayBuffer());

    return {
        buffer,
        mime: media.mime_type,
        filename:
            media.filename ||
            `receipt-${Date.now()}.${extension}`,
    };
}


async function uploadToDirectus(file, accountId) {
    const form = new FormData();

    form.append("file", file.buffer, {
        filename: file.filename,
        contentType: file.mime,
    });

    const res = await fetch(`${DIRECTUS_URL}/files`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        body: form,
    });

    const json = await res.json();


                      return res
                        .status(200)
                        .json(withHome(JSON.stringify(json)))

    return json.data.id; // ← Directus file ID
}

async function attachReceipt(itemId, fileId) {
    await fetch(
        `${DIRECTUS_URL}/items/ipg_requests/${itemId}`,
        {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${ADMIN_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                receipt: fileId,
            }),
        }
    );
}

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
const studentData = async (phone, account = null, student_id = null) => {
    try {
        const response = await fetch(
            `https://lms.eu1.storap.com/flows/trigger/7569a48f-1732-4373-ae98-d942a1440ab5?phone=${phone}${account ? `&account=${account}` : ''}${student_id ? `&student_id=${student_id}` : ''}`
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
                    'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`,
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
        return res
            .status(200)
            .json(withHome("Something went wrong!1"))
    }
}

const withHome = (message) => {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            body: {
                "text": message //"https://zoom.us"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "cmd_main_menu",
                            title: "🏠 Main Menu"
                        }
                    }
                ]
            }
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

        const message = messages[0] || null
        if (!message) return res.status(200).json(withHome("Something went wrong!2"));

        if (message.type === "image") {
            try {
                const response = await fetch(
                    `https://lms.eu1.storap.com/items/ipg_requests
?filter[_or][0][_and][0][phone][_eq]=${to}
&filter[_or][0][_and][1][date_created][_gt]=$NOW(-1 hour)
&filter[_or][0][_and][2][receipt][_eq]=null
&filter[_or][0][_and][3][status][_neq]=paid
&filter[_or][1][_and][0][phone][_eq]=${to}
&filter[_or][1][_and][1][date_created][_gt]=$NOW(-7 days)
&filter[_or][1][_and][2][status][_eq]=failed
&fields=id,account&sort=-date_created&limit=1`,
                    {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                )

                const ipgData = await response.json()

                if (!response.ok) return res.status(200).json(withHome("Something went wrong!3"));
          
                if (ipgData?.data?.[0]?.id) {

                    const ipgRequestId = ipgData?.data?.[0]?.id || null
                    const accountId = ipgData?.data?.[0]?.account || null
                    if (!ipgRequestId || !accountId) return res.status(200).json(withHome("Something went wrong!4"));

                    const file = await downloadWhatsAppMedia(message);
                    const fileId = await uploadToDirectus(file, accountId);
                    await attachReceipt(ipgRequestId, fileId);

                    return res
                        .status(200)
                        .json(withHome(`‍Receipt පත ලැබුනා ✅. ඔබගේ ගෙවීම තහවුරු කිරීමෙන් පසු​ව SMS එකක් ලැබෙනු ඇත.\n\nරිසිට් පත් අංකය: ${fileId}\nගනුදෙනු අංකය: ${ipgRequestId}`))
                } else {
                    return res.status(200).json({
                        type: "interactive",
                        interactive: {
                            type: "button",
                            body: {
                                text: `*Digital Class Fee*\n\nHi, මම ඔබට මුදල් ගෙවීම සිදු කර ගැනීමට සහාය වන්නම්.`
                            },
                            action: {
                                buttons: [
                                    {
                                        type: "reply",
                                        reply: {
                                            id: "cmd_pay_fees",
                                            title: "ආරම්භ කරන්​න | Start"
                                        }
                                    },
                                    {
                                        type: "reply",
                                        reply: {
                                            id: "cmd_main_menu",
                                            title: "ඉවත් වන්න | Cancel"
                                        }
                                    }
                                ]
                            }
                        }
                    })
                }
            } catch(e) {
                return res
                    .status(200)
                    .json(withHome("Something went wrong!" + e.message))
            }
        }

        const strMessage = (
            messages?.[0]?.text?.body ||
            messages?.[0]?.interactive?.button_reply?.id ||
            ''
        ).toLowerCase()

        if (strMessage.includes('cmd_pay_account_student_')) {
            const data = strMessage.replace('cmd_pay_account_student_', '')
            const accountId = data.split('_')[0]
            const studentId = data.split('_')[1]
            const student = await studentData(to, accountId, studentId)

            if (!student || !student.id) {
                return res
                    .status(200)
                    .json(withHome("Sorry, this phone number is not valid!"))
            }

            return res.status(200).json({
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        text: `Your Payment Link Ready 👇\n\napp.smarttuit.com/portal/pay/init/${student?.student_id}/${student?.token}\n\nමෙම ලින්ක් එක හරහා ඔබට ගෙවීමට ඇති හිග ගාස්තු පරීක්ෂා කර තෝරන්න. පසුව ගෙවීම Digital Payment Method එකක් හරහා ගෙවීම සිදු කරන්න.‍\n\n ගැටලුවක​දී සහාය සදහා අමතන්​න\n076 025 8100.`
                    },
                    action: {
                        buttons: [
                            {
                                type: "reply",
                                reply: {
                                    id: "cmd_main_menu",
                                    title: "🏠 Main Menu"
                                }
                            }
                        ]
                    }
                }
            })
        }

        if (strMessage.includes('cmd_pay_account_')) {
            const accountId = strMessage.replace('cmd_pay_account_', '')
            const _students = await studentData(to, accountId)
            const students = _students

            if (!students || !students.length) {
                return res
                    .status(200)
                    .json(withHome("Sorry, this phone number is not valid!"))
            }

            return res.status(200).json({
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        text: "Select Institute or Teacher\nආයතනය හෝ ගුරුවරයාව තෝරන්​න 👇"
                    },
                    action: {
                        buttons: [
                            ...students.map(student => ({
                                type: "reply",
                                reply: {
                                    id: `cmd_pay_account_student_${accountId}_${student.student_id}`,
                                    title: student.name
                                }
                            })),
                            ...(students.length === 3
                                ? []
                                : [{
                                    type: "reply",
                                    reply: {
                                        id: "cmd_main_menu",
                                        title: "🏠 Main Menu"
                                    }
                                }]
                            )
                        ]
                    }
                }
            })
        }

        if (strMessage.includes('cmd_pay_fees')) {
            const students = await studentData(to)

            if (!students || !students.length) {
                return res
                    .status(200)
                    .json(withHome("Sorry, this phone number is not valid!"))
            }

            const uniqueAccounts = [
                ...new Map(
                    students.map(s => [s.account.id, s.account])
                ).values()
            ]

            return res.status(200).json({
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        text: "Select Student\nළමයාව තෝරන්න 👇"
                    },
                    action: {
                        buttons: [
                            ...uniqueAccounts.map(account => ({
                                type: "reply",
                                reply: {
                                    id: `cmd_pay_account_${account.id}`,
                                    title: account.name
                                }
                            })),
                            ...(uniqueAccounts.length === 3
                                ? []
                                : [{
                                    type: "reply",
                                    reply: {
                                        id: "cmd_main_menu",
                                        title: "🏠 Main Menu"
                                    }
                                }]
                            )
                        ]
                    }
                }
            })
        }

        if (strMessage.includes('cmd_zoom')) {
            const zoom = await zoomMeetingData(to);
            if (zoom?.data?.length == 0) return res.status(200).json(withHome("You haven't zoom meetings!"));
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
                                    title: "🏠 Main Menu"
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
                                title: "🎥 Join Online Class"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "cmd_pay_fees",
                                title: "💵 Pay Class Fees"
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

app.post('/get_payments', async (req, res) => {
    const { token } = req.body
    const decoded = atob(token)

    const valueArray = decoded.split("|");

    return res.status(200).json({
        student_sysid: valueArray[0],
        first_name: valueArray[1],
        last_name: valueArray[2],
        phone: valueArray[3],
        payable: valueArray[4],
        payments: valueArray[5],
    });
})

function sha256(source) {
    return crypto
        .createHash("sha256")
        .update(source)
        .digest("hex");
}

app.get('/health', async (req, res) => {
    return res.status(200).json({ "status": true });
})

app.post('/sha256', async (req, res) => {
    const { source } = req.body
    return res.status(200).json({ "sha256": sha256(source) });
})

app.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on port ${process.env.PORT}`)
})
