import dotenv from "dotenv";
import { Client, IntentsBitField } from "discord.js";
import axiosRetry from "axios-retry";
import axios from "axios";
import ready from "./listeners/ready";
import interactionCreate from "./listeners/interactionCreate";

function main() {
    dotenv.config();
    console.log("Bot is starting...");
    
    const client = new Client({
        intents: [IntentsBitField.Flags.Guilds]
    });

    // set this up once
    axiosRetry(axios, { retries: 99, retryDelay: axiosRetry.exponentialDelay });

    // setup listeners
    ready(client);
    interactionCreate(client);

    // login
    client.login(process.env.SECRET_TOKEN);
    
    console.log("Logged in!");
    
}

main();
