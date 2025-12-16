import express from "express";
const router = express.Router();
router.get("/", (req, res) => {
  res.json({
    organization: "Student Cyber Games"
  });
});

export default router;
