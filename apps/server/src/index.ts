import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { initDatabase } from "./db/init.js";
import { userRoutes } from "./routes/users.js";
import { coursesRoutes } from "./routes/courses.js";

const app = express();

app.use(cors());
app.use(express.json());

// serve uploaded files (materials and favicons)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const apiRoutes = express.Router();
apiRoutes.get("/", (_req, res) => {
  res.status(200).json({
    organization: "Student Cyber Games"
  });
});

apiRoutes.use("/users", userRoutes);
apiRoutes.use("/courses", coursesRoutes);
app.use("/api", apiRoutes);

const port = process.env.PORT || 3000;
async function start() {
	await initDatabase();
	app.listen(port, () => {
		console.log(`Server is running on port ${port}`);
	});
}

start();
