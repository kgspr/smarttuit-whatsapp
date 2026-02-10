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

async function downloadWhatsAppImage(message) {
    const mediaId = message.image.id;

    // 1. Get media URL
    const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${mediaId}`,
        {
            headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            },
        }
    );

    const { url } = await metaRes.json();

    // 2. Download binary
    const imgRes = await fetch(url, {
        headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
    });

    const buffer = Buffer.from(await imgRes.arrayBuffer());

    return {
        buffer,
        mime: message.image.mime_type,
        filename: `receipt-${Date.now()}.jpg`,
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
            .json(withHome("Something went wrong!"))
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
        if (!message) return res.status(200).json(withHome("Something went wrong!"));

        if (messages[0].type == 'image') {
            try {
                const response = await fetch(
                    `https://lms.eu1.storap.com/items/ipg_requests?filter[phone][_eq]=${to}&fields=id,account&sort=-date_created&limit=1`,
                    {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                )

                const ipgData = await response.json()

                if (!response.ok) return res.status(200).json(withHome("Something went wrong!"));

                const ipgRequestId = ipgData?.data?.[0]?.id || null
                const accountId = ipgData?.data?.[0]?.account || null
                if (!ipgRequestId || !accountId) return res.status(200).json(withHome("Something went wrong!"));

                const file = await downloadWhatsAppImage(message);
                const fileId = await uploadToDirectus(file, accountId);
                await attachReceipt(ipgRequestId, fileId);

                const options = {
                    method: 'PATCH',
                    headers: {
                        Authorization: 'Bearer _bRSdfALKVbionFG3jFi_L4JV5e8M68s',
                        'Content-Type': 'application/json'
                    },
                    body: '{"account":51}'
                };

//                 const controller = new AbortController();

// setTimeout(() => controller.abort(), 3_000);

//                 await fetch(`https://lms.eu1.storap.com/files/${fileId}`, options)
//                 .then((resImg) => {
//                     return res
//                     .status(200)
//                     .json(resImg)
//                 })
//                     .catch(err => {
//                         return res
//                             .status(200)
//                             .json(withHome("Something went wrong!"))
//                     });

                return res
                    .status(200)
                    .json(withHome(fileId))
            } catch {
                return res
                    .status(200)
                    .json(withHome("Something went wrong!"))
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
                        text: `app.smarttuit.com/portal/pay/init/${student?.student_id}/${student?.token}`
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
            const students = _students.filter(
                (s) => s.account === accountId
            );

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
                        text: "Select"
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
                        text: "Select"
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

app.post('/sha256', async (req, res) => {
    const { source } = req.body
    return res.status(200).json({ "sha256": sha256(source) });
})

app.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on port ${process.env.PORT}`)
})
