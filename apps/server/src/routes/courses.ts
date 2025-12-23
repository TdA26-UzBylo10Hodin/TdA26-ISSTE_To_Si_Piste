import express from "express";
import { randomUUID } from "crypto";
import { pool } from "../db/index.js";

export const coursesRoutes = express.Router();

const feedSubscribers = new Map<string, Set<express.Response>>();

function now() { return new Date().toISOString(); }

async function getCourseRow(uuid: string) {
  const [rows]: any = await pool.execute('SELECT * FROM courses WHERE uuid = ?', [uuid]);
  return rows && rows.length ? rows[0] : null;
}

function parseJsonField(v: any) {
  if (v == null) return [];
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return []; }
  }
  return v;
}

function toCourseObject(row: any) {
  return {
    uuid: row.uuid,
    name: row.name,
    description: row.description || "",
    materials: parseJsonField(row.materials),
    quizzes: parseJsonField(row.quizzes),
    feed: parseJsonField(row.feed),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

// List courses
coursesRoutes.get("/", async (_req, res) => {
  try {
    const [rows]: any = await pool.execute('SELECT uuid, name, description, materials, quizzes, feed, created_at, updated_at FROM courses ORDER BY created_at DESC');
    const list = (rows || []).map((r: any) => toCourseObject(r));
    res.status(200).json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list courses' });
  }
});

// Create course
coursesRoutes.post("/", async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const id = randomUUID();
  try {
    await pool.execute(
      `INSERT INTO courses (uuid, name, description, materials, quizzes, feed) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, description || '', JSON.stringify([]), JSON.stringify([]), JSON.stringify([])]
    );
    // initialize SSE subscribers set
    feedSubscribers.set(id, new Set());
    const row = await getCourseRow(id);
    res.status(201).json(toCourseObject(row));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// Get course detail
coursesRoutes.get("/:courseId", async (req, res) => {
  const { courseId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    res.status(200).json(toCourseObject(row));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get course' });
  }
});

// Update course (name/description)
coursesRoutes.put("/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const { name, description } = req.body || {};
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const newName = name !== undefined ? name : row.name;
    const newDesc = description !== undefined ? description : row.description;
    await pool.execute('UPDATE courses SET name = ?, description = ? WHERE uuid = ?', [newName, newDesc, courseId]);
    const updated = await getCourseRow(courseId);
    res.status(200).json(toCourseObject(updated));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

// Delete course
coursesRoutes.delete("/:courseId", async (req, res) => {
  const { courseId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    await pool.execute('DELETE FROM courses WHERE uuid = ?', [courseId]);
    const subs = feedSubscribers.get(courseId);
    if (subs) {
      subs.forEach(r => r.end());
      feedSubscribers.delete(courseId);
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// Materials endpoints (CRUD stored within JSON materials array)
coursesRoutes.get("/:courseId/materials", async (req, res) => {
  const { courseId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    res.status(200).json(parseJsonField(row.materials));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get materials' });
  }
});

coursesRoutes.post("/:courseId/materials", async (req, res) => {
  const { courseId } = req.params;
  const body = req.body || {};
  if (!body.type || !body.name) return res.status(400).json({ error: "type and name required" });
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const materials = parseJsonField(row.materials);
    const id = randomUUID();
    let material: any;
    if (body.type === "url") {
      material = { uuid: id, type: "url", name: body.name, description: body.description || "", url: body.url || "", faviconUrl: body.faviconUrl || null };
    } else {
      material = { uuid: id, type: "file", name: body.name, description: body.description || "", fileUrl: body.fileUrl || "", mimeType: body.mimeType || null, sizeBytes: body.sizeBytes || 0 };
    }
    materials.push(material);
    await pool.execute('UPDATE courses SET materials = ? WHERE uuid = ?', [JSON.stringify(materials), courseId]);
    res.status(201).json(material);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create material' });
  }
});

coursesRoutes.put("/:courseId/materials/:materialId", async (req, res) => {
  const { courseId, materialId } = req.params;
  const body = req.body || {};
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const materials = parseJsonField(row.materials);
    const m = materials.find((x: any) => x.uuid === materialId);
    if (!m) return res.status(404).json({ message: "Material not found" });
    if (body.name !== undefined) m.name = body.name;
    if (body.description !== undefined) m.description = body.description;
    if (body.url !== undefined) m.url = body.url;
    if (body.fileUrl !== undefined) m.fileUrl = body.fileUrl;
    await pool.execute('UPDATE courses SET materials = ? WHERE uuid = ?', [JSON.stringify(materials), courseId]);
    res.status(200).json(m);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update material' });
  }
});

coursesRoutes.delete("/:courseId/materials/:materialId", async (req, res) => {
  const { courseId, materialId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const materials = parseJsonField(row.materials);
    const idx = materials.findIndex((x: any) => x.uuid === materialId);
    if (idx === -1) return res.status(404).json({ message: "Material not found" });
    materials.splice(idx, 1);
    await pool.execute('UPDATE courses SET materials = ? WHERE uuid = ?', [JSON.stringify(materials), courseId]);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// Quizzes
coursesRoutes.get("/:courseId/quizzes", async (req, res) => {
  const { courseId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    res.status(200).json(parseJsonField(row.quizzes));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get quizzes' });
  }
});

coursesRoutes.post("/:courseId/quizzes", async (req, res) => {
  const { courseId } = req.params;
  const body = req.body || {};
  if (!body.title || !Array.isArray(body.questions)) return res.status(400).json({ error: "title and questions required" });
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const quizzes = parseJsonField(row.quizzes);
    const id = randomUUID();
    const quiz = { uuid: id, title: body.title, attemptsCount: 0, questions: body.questions.map((q: any) => ({ uuid: randomUUID(), ...q })) };
    quizzes.push(quiz);
    await pool.execute('UPDATE courses SET quizzes = ? WHERE uuid = ?', [JSON.stringify(quizzes), courseId]);
    res.status(201).json(quiz);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create quiz' });
  }
});

coursesRoutes.get("/:courseId/quizzes/:quizId", async (req, res) => {
  const { courseId, quizId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const quizzes = parseJsonField(row.quizzes);
    const q = quizzes.find((x: any) => x.uuid === quizId);
    if (!q) return res.status(404).json({ message: "Quiz not found" });
    res.status(200).json(q);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get quiz' });
  }
});

coursesRoutes.put("/:courseId/quizzes/:quizId", async (req, res) => {
  const { courseId, quizId } = req.params;
  const body = req.body || {};
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const quizzes = parseJsonField(row.quizzes);
    const idx = quizzes.findIndex((x: any) => x.uuid === quizId);
    if (idx === -1) return res.status(404).json({ message: "Quiz not found" });
    if (body.title !== undefined) quizzes[idx].title = body.title;
    if (Array.isArray(body.questions)) quizzes[idx].questions = body.questions.map((q: any) => ({ uuid: randomUUID(), ...q }));
    await pool.execute('UPDATE courses SET quizzes = ? WHERE uuid = ?', [JSON.stringify(quizzes), courseId]);
    res.status(200).json(quizzes[idx]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update quiz' });
  }
});

coursesRoutes.delete("/:courseId/quizzes/:quizId", async (req, res) => {
  const { courseId, quizId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const quizzes = parseJsonField(row.quizzes);
    const idx = quizzes.findIndex((x: any) => x.uuid === quizId);
    if (idx === -1) return res.status(404).json({ message: "Quiz not found" });
    quizzes.splice(idx, 1);
    await pool.execute('UPDATE courses SET quizzes = ? WHERE uuid = ?', [JSON.stringify(quizzes), courseId]);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
});

// Submit quiz (scoring done in-memory without persisting attempts)
coursesRoutes.post("/:courseId/quizzes/:quizId/submit", async (req, res) => {
  const { courseId, quizId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const quizzes = parseJsonField(row.quizzes);
    const q = quizzes.find((x: any) => x.uuid === quizId);
    if (!q) return res.status(404).json({ message: "Quiz not found" });
    const body = req.body || {};
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const correctPerQuestion: boolean[] = [];
    let score = 0;
    for (const question of q.questions) {
      const ans = answers.find((a: any) => a.uuid === question.uuid) || {};
      let ok = false;
      if (question.type === "singleChoice") {
        ok = (ans.selectedIndex === question.correctIndex);
      } else if (question.type === "multipleChoice") {
        const s = Array.isArray(ans.selectedIndices) ? ans.selectedIndices.slice().sort() : [];
        const cidx = Array.isArray(question.correctIndices) ? question.correctIndices.slice().sort() : [];
        ok = s.length === cidx.length && s.every((v: number, i: number) => v === cidx[i]);
      }
      if (ok) score += 1;
      correctPerQuestion.push(!!ok);
    }
    const response = {
      quizUuid: q.uuid,
      score,
      maxScore: q.questions.length,
      correctPerQuestion,
      submittedAt: now()
    };
    res.status(200).json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// Feed
coursesRoutes.get("/:courseId/feed", async (req, res) => {
  const { courseId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    res.status(200).json(parseJsonField(row.feed));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

function broadcastFeed(courseId: string, event: string, data: any) {
  const subs = feedSubscribers.get(courseId);
  if (!subs) return;
  const payload = JSON.stringify(data);
  subs.forEach(r => {
    try {
      r.write(`event: ${event}\n`);
      r.write(`data: ${payload}\n\n`);
    } catch (e) {
      // ignore
    }
  });
}

coursesRoutes.post("/:courseId/feed", async (req, res) => {
  const { courseId } = req.params;
  const body = req.body || {};
  if (!body.message) return res.status(400).json({ error: "message required" });
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const feed = parseJsonField(row.feed);
    const id = randomUUID();
    const item = { uuid: id, type: "manual", message: body.message, edited: false, createdAt: now(), updatedAt: now() };
    feed.push(item);
    await pool.execute('UPDATE courses SET feed = ? WHERE uuid = ?', [JSON.stringify(feed), courseId]);
    broadcastFeed(courseId, "new_post", item);
    res.status(201).json(item);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to post feed item' });
  }
});

coursesRoutes.put("/:courseId/feed/:postId", async (req, res) => {
  const { courseId, postId } = req.params;
  const body = req.body || {};
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const feed = parseJsonField(row.feed);
    const post = feed.find((x: any) => x.uuid === postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (body.message !== undefined) post.message = body.message;
    if (body.edited !== undefined) post.edited = !!body.edited;
    post.updatedAt = now();
    await pool.execute('UPDATE courses SET feed = ? WHERE uuid = ?', [JSON.stringify(feed), courseId]);
    broadcastFeed(courseId, "updated_post", post);
    res.status(200).json(post);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

coursesRoutes.delete("/:courseId/feed/:postId", async (req, res) => {
  const { courseId, postId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    const feed = parseJsonField(row.feed);
    const idx = feed.findIndex((x: any) => x.uuid === postId);
    if (idx === -1) return res.status(404).json({ message: "Post not found" });
    feed.splice(idx, 1);
    await pool.execute('UPDATE courses SET feed = ? WHERE uuid = ?', [JSON.stringify(feed), courseId]);
    broadcastFeed(courseId, "deleted_post", { uuid: postId });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// SSE stream
coursesRoutes.get("/:courseId/feed/stream", async (req, res) => {
  const { courseId } = req.params;
  try {
    const row = await getCourseRow(courseId);
    if (!row) return res.status(404).json({ message: "Course not found" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`: connected\n\n`);
    const subs = feedSubscribers.get(courseId) || new Set();
    subs.add(res);
    feedSubscribers.set(courseId, subs);
    req.on("close", () => {
      subs.delete(res);
    });
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});
