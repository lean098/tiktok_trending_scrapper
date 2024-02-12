import express from "express";
import cors from "cors";

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

import { scrollPageToBottom } from "puppeteer-autoscroll-down";

import { load } from "cheerio";

import { wait } from "./helpers/wait.js";

const app = express();

type Videos = {
  video: string;
  thumbnail: string;
  views: string;
  like: string;
  user: {
    name: string;
    avatar: string;
  };
};

type Users = {
  link: string;
  thumbnail: string;
  title: string;
  description: string;
  followers: string;
};

type Hashtags = {
  link: string;
  name: string;
  views: string;
};

type Musics = {
  link: string;
  thumbnail: string;
  name: string;
  author: string;
  duration: string;
};

type Topics = {
  link: string;
  name: string;
};

app.use(express.json());
app.use(cors());

app.get("/", (_, res) => {
  res.status(500).json({ error: "Internal server error" });
});

app.get("/trending", async (req, res) => {
  try {
    const { lng = "pt-BR" } = req.query;
    const url = `https://www.tiktok.com/discover/trending?lang=${lng}`;

    console.log({
      lng,
    });

    let browser = null;

    const options = process.env.AWS_REGION
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath(
            "https://github.com/Sparticuz/chromium/releases/download/v110.0.1/chromium-v110.0.1-pack.tar"
          ),
          headless: true,
          ignoreHTTPSErrors: true,
        }
      : {
          defaultViewport: null,
          args: ["--start-maximized"],
          executablePath:
            process.platform === "win32"
              ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
              : process.platform === "linux"
              ? "/usr/bin/google-chrome"
              : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          headless: false,
        };

    browser = await puppeteer.launch(options);

    const page = await browser.newPage();

    try {
      await page.goto(url as string, {
        waitUntil: "domcontentloaded",
      });

      const times = [1, 2, 3, 4, 5];

      for await (const t of times) {
        await wait(150).finally(async () => {
          await scrollPageToBottom(page, {
            size: 1000,
            delay: 150,
          });
        });
      }

      const html = await page.content();

      const $ = load(html);

      const mainContent = $("#main-content-discover_kw");

      const videos: Array<Videos> = [];

      // Videos
      $(mainContent)
        .find('[class*="DivGridContainer"]')
        .contents()
        .each((_, elem) => {
          const views = $(elem).find('[class*="StrongLikes"]').text() ?? "";

          if (!views) return;

          const video = $(elem).find("a").attr("href") ?? "";
          const thumbnail = $(elem).find("img").attr("src") ?? "";
          const user = {
            name: $(elem).find('[data-e2e="video-user-name"]').text(),
            avatar:
              $(elem)
                .find('[data-e2e="video-user-avatar"]')
                .find("img")
                .attr("src") ?? "",
          };
          const like = $(elem).find('[class*="SpanLikes"]').text() ?? "";

          videos.push({
            video: video ? `https://www.tiktok.com${video}` : "",
            thumbnail,
            views,
            like,
            user,
          });
        });

      const users: Array<Users> = [];

      // Users
      const usersList = $(mainContent)
        .find('div[class*="DivUserContentBox"]')
        .find('div[class*="DivUserListContainer"]')
        .contents();

      usersList.each((_, user) => {
        const thumbnail = $(user).find("img").attr("src") ?? "";

        if (!thumbnail) return;

        const link = $(user).find("a").attr("href") ?? "";
        const title = $(user)
          .find('[data-e2e="suggest-user-title"]')
          .find("span")
          .text();
        const description = $(user)
          .find('[data-e2e="suggest-user-desc"]')
          .text();
        const followers = $(user).find("p").last().text();

        users.push({
          link: `https://www.tiktok.com${link}`,
          thumbnail,
          title,
          description,
          followers,
        });
      });

      const musics: Array<Musics> = [];

      // Music
      const musicsList = $(mainContent)
        .find('div[class*="DivMusicContainer"]')
        .find('div[class*="DivMusicListContainer"]')
        .contents();

      musicsList.each((_, music) => {
        const link = $(music).find("a").attr("href") ?? "";
        const thumbnail = $(music).find("img").attr("src") ?? "";
        const name = $(music).find('[data-e2e="music-name"]').text();
        const author = $(music).find('[class*="MusicAuthor"]').text();
        const duration = $(music).find('[class*="DivStats"]').text();

        musics.push({
          link: `https://www.tiktok.com${link}`,
          thumbnail,
          name,
          author,
          duration,
        });
      });

      const hashtags: Array<Hashtags> = [];

      // Hashtags
      const hashtagsList = $(mainContent)
        .find('div[class*="DivHashtagContentBox"]')
        .find('div[class*="DivHashtagListContainer"]')
        .contents();

      hashtagsList.each((_, hashtag) => {
        const name = $(hashtag).find('[data-e2e="hashtags-name"]').text();

        if (!name) return;

        const link = $(hashtag).find("a").attr("href") ?? "";
        const views = $(hashtag)
          .find('[data-e2e="hashtags-name"]')
          .next()
          .text();

        hashtags.push({
          link: `https://www.tiktok.com${link}`,
          name,
          views,
        });
      });

      const topics: Array<Topics> = [];

      // Topics
      const topicsList = $(mainContent)
        .find('div[class*="DivTopicContentBox"]')
        .find('div[class*="DivRelatedWordsContainer"]')
        .contents();

      topicsList.each((_, topic) => {
        const link = $(topic).attr("href") ?? "";

        if (!link) return;

        const name = $(topic).find('[data-e2e="topic-name"]').text();

        topics.push({
          link: `https://www.tiktok.com${link}`,
          name,
        });
      });

      const data = {
        videos,
        users,
        musics,
        hashtags,
        topics,
      };

      return res.status(200).json({ ...data });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "get data from api error", link: "" });
    } finally {
      if (browser !== null) {
        await browser.close();
      }
    }
  } catch (error) {
    res
      .status(500)
      .json({ error: `Internal server error >> ${error}`, data: {} });
  }
});

app.listen(process.env.PORT || 3000);
