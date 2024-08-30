import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import fs from 'fs/promises';

// Use stealth plugin
puppeteer.use(StealthPlugin());
// Path to your JSON file
const filePath = 'jobs.json';

async function loadJson() {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        console.log('JSON loaded');
        return jsonData;
    } catch (err) {
        console.error('Error reading or parsing the file:', err);
    }
}

async function saveJson(jsonData) {
    try {
        const data = JSON.stringify(jsonData, null, 2);
        await fs.writeFile(filePath, data, 'utf8');
        console.log('JSON file updated successfully.');
    } catch (err) {
        console.error('Error writing the file:', err);
    }
}

// Replace with your Telegram Bot Token and Chat ID
const TELEGRAM_BOT_TOKEN = 'TOKEN';
const TELEGRAM_CHAT_ID = 'CHATID';

async function sendTelegramMessage(upworkJob) {
    // Function to escape Markdown special characters
    function escapeMarkdown(text) {
        const markdownChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
        markdownChars.forEach((char) => {
            text = text.split(char).join(`\\${char}`);
        });
        return text;
    }

    const message = `
New Upwork Job:
Title: ${escapeMarkdown(upworkJob.title.trim())}
Description: ${escapeMarkdown(cleanText(upworkJob.description.trim()))}
Link: ${escapeMarkdown(upworkJob.link.trim())}
Publish Date: ${escapeMarkdown(upworkJob.publish_date.trim())}
    `;

    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'  // You can switch to 'HTML' if needed
        });
        console.log(`Telegram message sent successfully for job: ${upworkJob.title}`);
    } catch (error) {
        console.error(`Failed to send Telegram message for job: ${upworkJob.title}`, error);
    }
}

function cleanText(text) {
    let cleanedText = text.replace(/<[^>]*>/g, '');
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
    return cleanedText;
}

function isOlderThanOneDay(publishDate) {
    const jobDate = new Date(publishDate);
    const now = new Date();
    const diffTime = now - jobDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays > 1;
}

async function scrapeJobs() {
    const browser = await puppeteer.launch({ 
        headless: true,
        slowMo : 2,
     });
    const page = await browser.newPage();
    
    // page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    const upWorkFeed = 'https://www.upwork.com/nx/find-work/most-recent';
    await page.goto(upWorkFeed, { waitUntil: 'networkidle2' });

    // Scrape job data using the updated selectors
    const jobs = await page.evaluate(() => {
        let jobElements = document.querySelectorAll('.air3-card-section.air3-card-hover.p-4.px-2x.px-md-4x'); // Updated selector for the job card
        let jobData = [];

        jobElements.forEach((jobElement) => {
            // Updated selectors based on the HTML structure
            let titleElement = jobElement.querySelector('h3.job-tile-title a'); 
            let title = titleElement ? titleElement.innerText : '';

            let descriptionElement = jobElement.querySelector('span[data-test="job-description-text"]'); 
            let description = descriptionElement ? descriptionElement.innerText : '';

            let link = titleElement ? titleElement.href : ''; 

            let publishDateElement = jobElement.querySelector('span.text-caption span[data-test="posted-on"]');
            let publishDate = publishDateElement ? publishDateElement.innerText : '';

            // Debugging: Log the elements and their text content to see what is being fetched
            console.log("Title:", title);
            console.log("Description:", description);
            console.log("Link:", link);
            console.log("Publish Date:", publishDate);

            jobData.push({
                title,
                description,
                link,
                publish_date: publishDate,
            });
        });

        return jobData;
    });

    await browser.close();
    return jobs;
}

async function checkJobs() {
    let jobs = await loadJson();

    const upworkJobs = await scrapeJobs();
    console.log(upworkJobs);
    // return;
    // const newJobs = upworkJobs
    //     .filter((job) => !isOlderThanOneDay(job.publish_date))
    //     .map((job) => ({
    //         id: job.link, // Use the job link as a unique identifier
    //         title: job.title,
    //         description: job.description,
    //         link: job.link,
    //         publish_date: job.publish_date,
    //     }));
    
    // const uniqueUpworkJobs = newJobs.filter(
    //     (job, index, self) =>
    //         index === self.findIndex((t) => t.id === job.id && t.title === job.title)
    // );

    for (let i = 0; i < upworkJobs.length; i++) {
        const upworkJob = upworkJobs[i];
        
        if (jobs[upworkJob['link']]) {
            break;
        } else {
            jobs[upworkJob['link']] = upworkJob['link'];
            await sendTelegramMessage(upworkJob);
        }
    }

    await saveJson(jobs);
}

// Set interval to run the checkJobs function every 15 minutes
const interval = 15 * 60 * 1000;
setInterval(checkJobs, interval);

// Run the function immediately on start
checkJobs();
