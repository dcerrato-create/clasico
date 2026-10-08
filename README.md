# Clásico
Welcome to Clásico!
## 1. What it does
Clásico has ALL documented international matches since 1872, close to 50,000 games, with more updated as games come. It is built around the idea of "Classic Matches", and compares two teams and their history of games played. It then gives an AI story about the rivalry, and a lot of data and statistics divided in 3 interactive sections. You can also filter your data by competition. Whenever two countries are inputted that have never played a game, you can go to the recent games per country, which was added so you can find rivalries for that country if you don't know of any. I then added a fun section about unusual games, with 7 subcategories, showing rare facts like rivalries that have only happened once, the oldest rivalries, most played rivalries, among others. It is basically a tool where you can easily find data about any two countries you want with my own personal angle: Latin America featured rivalries and a bilingual AI story. I did it because usually when you want to find data about rivalries, there is so much out there that it is not all in the same place. This is the place where all the info is, all the rivalries in the same place, accessible to anyone. So now when two teams play, you know where to go to look up their history! You now don't have to look into many different websites, everything will be here.

## 2. How to use it
It is very easy: first, pick 2 teams, or click on a featured rivalry. Second, watch the flags and headline stats reveal, then read the AI story (switch between English and Spanish freely). Third, explore the tabs: Timeline, Era Chart, More Statistics. Fourth, filter the data to look by whichever competition these two teams have played. Fifth, if you can't find a rivalry for a country, go to the recent games section. Lastly, have fun by learning about the unusual games section. Works on a computer and phone.

## 3. Features I'm most proud of
The feature I am most proud of is the AI story. It streams live and is grounded in the app's data, Wikipedia, and the AI's own knowledge to tell a cohesive and educational story. The second feature I am most proud of is all the interactivity in the Era Chart and Match Timeline. There are endless things you can do: filter by competition, filter by date, go to a specific competition on a specific timeline, among many other things. It is a great research tool for getting to know about a rivalry with almost endless things to learn.

## 4. How to run it locally
To run it locally simply:
- Clone the repo, then `pip install -r backend/requirements.txt`
- Copy `.env.example` to `.env` and add your own `OPENAI_API_KEY` (the app works without it; only AI Story is disabled)
- Start the backend (port 5001), then open `docs/index.html`, or double-click `start.command`, which does both

## 5. How secrets are handled
- The OpenAI key is in `.env` locally (gitignored) and in Render's Environment variables in production
- The browser never sees it; all OpenAI calls go through the Flask backend
- Credit protection: caching, one call per new story, a rate limit, cancellation, and a $10 hard spend limit

## 6. How I used AI
AI was used in 3 different ways throughout this project:
- Claude Code (Opus 5.5) wrote most of the code from my prompts, and I directed each feature, tested it, and made my own edits. For example, in the Honduras flag to correct the colors and in the featured rivalries section.
- Claude chat for brainstorming, planning, key prompts and rubric checks
- OpenAI gpt-5.4 to power the AI Story inside the app

See [prompt_log.md](prompt_log.md) for the full details.

## Citations
- Match data: github.com/martj42/international_results
- Flags: flagcdn.com; the Honduras flag and the flags of former countries are from Wikimedia Commons (public domain)
- Rivalry history for the AI Story: Wikipedia
- AI Story: OpenAI API
- Match Timeline chart: Chart.js
- Fonts: Google Fonts (Anton, Bebas Neue, Inter)
- Hosting: Render (backend) and GitHub Pages (frontend)
