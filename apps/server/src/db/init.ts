import "dotenv/config";
import { pool } from "./index.js";

export async function initDatabase() {
	try {
		console.log("Initializing database schema...");

		await pool.execute(`
			CREATE TABLE IF NOT EXISTS users (
				id INT AUTO_INCREMENT PRIMARY KEY,
				email VARCHAR(255) NOT NULL,
				name VARCHAR(255) NOT NULL,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
			)
		`);

		await pool.execute(`
			CREATE TABLE IF NOT EXISTS courses (
				uuid VARCHAR(36) PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				description TEXT,
				materials JSON,
				quizzes JSON,
				feed JSON,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
			)
		`);

		// Insert a default course used by the web to check DB connectivity if it doesn't exist
		const defaultUuid = '00000000-0000-0000-0000-000000000001';
		const [rows]: any = await pool.execute('SELECT uuid FROM courses WHERE uuid = ?', [defaultUuid]);
		if (!rows || rows.length === 0) {
			await pool.execute(
				`INSERT INTO courses (uuid, name, description, materials, quizzes, feed) VALUES (?, ?, ?, ?, ?, ?)`,
				[
					defaultUuid,
					'default-course',
					'Default course inserted by server to verify DB connectivity',
					JSON.stringify([]),
					JSON.stringify([]),
					JSON.stringify([]),
				]
			);
			console.log('Inserted default course with uuid', defaultUuid);
		} else {
			console.log('Default course already present');
		}

		console.log("Database schema initialized successfully!");
	} catch (error) {
		console.error("Error initializing database:", error);
	}
}
