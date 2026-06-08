import express from 'express';
import { JobCrawler } from '../services/job-crawler';
import { CoverLetterGenerator } from '../services/cover-letter-generator';
import { ApplicationFiller } from '../services/application-filler';
import { StagehandFiller } from '../services/stagehand-filler';
import { FieldMapperService } from '../services/field-mapper.service';
import {
  insertApplication,
  getResumeById,
  getUserProfileFromResume,
  getStructuredResumeById,
  checkIfAlreadyApplied,
} from '../services/db';
import path from 'path';

const router = express.Router();
const fieldMapper = new FieldMapperService();

const useStagehand = process.env.USE_STAGEHAND === 'true';
type FillerInstance = ApplicationFiller | StagehandFiller;
function createFiller(): FillerInstance {
  return useStagehand ? new StagehandFiller() : new ApplicationFiller();
}

// Process multiple job applications
router.post('/jobs', async (req, res) => {
  try {
    const { jobUrls, resumeId } = req.body;

    if (!jobUrls || !Array.isArray(jobUrls) || jobUrls.length === 0) {
      return res.status(400).json({ error: 'jobUrls array is required' });
    }

    if (!resumeId) {
      return res.status(400).json({ error: 'resumeId is required' });
    }

    // Get user profile from stored resume
    const rawProfile = getUserProfileFromResume(resumeId);
    if (!rawProfile || !rawProfile.name || !rawProfile.email) {
      return res.status(400).json({
        error:
          'Resume not found or missing user profile. Please upload resume with profile information first.',
      });
    }
    const userProfile = {
      ...rawProfile,
      name: rawProfile.name!,
      email: rawProfile.email!,
      experience: rawProfile.experience || '',
      skills: rawProfile.skills || [],
      achievements: rawProfile.achievements || [],
    };

    // Initialize services
    const jobCrawler = new JobCrawler();
    const coverLetterGenerator = new CoverLetterGenerator();
    const applicationFiller = createFiller();

    try {
      // Step 1: Filter out already-applied jobs
      const newUrls = jobUrls.filter((url: string) => {
        // if (checkIfAlreadyApplied(url)) {
        //   console.log(`[Dedup] Skipping already-applied job: ${url}`);
        //   return false;
        // }
        return true;
      });

      if (newUrls.length === 0) {
        return res.json({
          message: 'All jobs have already been applied to.',
          results: [],
        });
      }

      if (newUrls.length < jobUrls.length) {
        console.log(`[Dedup] Filtered ${jobUrls.length - newUrls.length} duplicate(s). Processing ${newUrls.length} new job(s).`);
      }

      // Step 2: Crawl job descriptions
      console.log('Crawling job descriptions...');
      const jobDescriptions = await jobCrawler.crawlMultipleJobs(newUrls);

      if (jobDescriptions.length === 0) {
        return res.status(400).json({ error: 'No job descriptions could be extracted' });
      }

      // Step 2: Get resume text and structured resume
      const resumeText = await getResumeText(resumeId);
      if (!resumeText) {
        return res.status(400).json({ error: 'Resume not found' });
      }

      // Get structured resume for better AI context
      const structuredResume = getStructuredResumeById(resumeId);

      // Step 3: Generate cover letters for each job
      console.log('Generating cover letters...');
      const coverLetters = await Promise.all(
        jobDescriptions.map(job =>
          coverLetterGenerator.generateCoverLetter(job, userProfile, resumeText).catch(err => {
            console.error(`[CoverLetter] Failed for ${job.url}:`, err);
            return '';
          })
        )
      );

      // Step 4: Fill applications
      console.log('Filling applications...');
      await applicationFiller.init();
      const resumeRecord = getResumeById(resumeId) as any;
      const resumeFilePath = path.join(__dirname, '..', 'data', 'resumes', resumeRecord.filename);
      const applications = jobDescriptions.map((job, index) => ({
        jobUrl: job.url,
        coverLetter: coverLetters[index],
        resumePath: resumeFilePath,
        applyLink: jobDescriptions[index].applyLink,
        resumeText,
        structuredResume,
      }));

      const results = await applicationFiller.processMultipleApplications(
        applications,
        userProfile
      );

      // Step 5: Save results to database
      const savedResults = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const jobDesc = jobDescriptions[i];

        const applicationId = insertApplication(
          jobDesc.url,
          result.success ? 'submitted' : 'failed',
          JSON.stringify({
            coverLetter: applications[i].coverLetter,
            error: result.error,
            submittedAt: result.submittedAt,
          })
        );

        savedResults.push({
          jobUrl: jobDesc.url,
          jobTitle: jobDesc.title,
          company: jobDesc.company,
          applicationId,
          success: result.success,
          error: result.error,
          screenshotPath: result.screenshotPath,
        });
      }

      res.json({
        message: `Processed ${jobUrls.length} job applications`,
        results: savedResults,
      });
    } finally {
      // Clean up
      await jobCrawler.close();
      await applicationFiller.close();
    }
  } catch (error: any) {
    console.error('Error processing job applications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process single job application
router.post('/job', async (req, res) => {
  try {
    const { jobUrl, resumeId } = req.body;

    if (!jobUrl) {
      return res.status(400).json({ error: 'jobUrl is required' });
    }

    if (!resumeId) {
      return res.status(400).json({ error: 'resumeId is required' });
    }

    const rawProfile = getUserProfileFromResume(resumeId);
    if (!rawProfile || !rawProfile.name || !rawProfile.email) {
      return res.status(400).json({
        error:
          'Resume not found or missing user profile. Please upload resume with profile information first.',
      });
    }
    const userProfile = {
      ...rawProfile,
      name: rawProfile.name!,
      email: rawProfile.email!,
      experience: rawProfile.experience || '',
      skills: rawProfile.skills || [],
      achievements: rawProfile.achievements || [],
    };

    // Dedup check for single job
    if (checkIfAlreadyApplied(jobUrl)) {
      return res.status(409).json({ error: `Already applied to ${jobUrl}` });
    }

    const jobCrawler = new JobCrawler();
    const coverLetterGenerator = new CoverLetterGenerator();
    const applicationFiller = createFiller();

    try {
      console.log('Crawling job description...');
      const jobDescription = await jobCrawler.crawlJobDescription(jobUrl);

      const resumeText = await getResumeText(resumeId);
      if (!resumeText) {
        return res.status(400).json({ error: 'Resume not found' });
      }

      const structuredResume = getStructuredResumeById(resumeId);

      console.log('Generating cover letter...');
      const coverLetter = await coverLetterGenerator.generateCoverLetter(
        jobDescription,
        userProfile,
        resumeText
      );

      console.log('Filling application...');
      await applicationFiller.init();
      const resumeRecord = getResumeById(resumeId) as any;
      const resumeFilePath = path.join(__dirname, '..', 'data', 'resumes', resumeRecord.filename);
      const results = await applicationFiller.processMultipleApplications(
        [
          {
            jobUrl,
            coverLetter,
            resumePath: resumeFilePath,
            applyLink: jobDescription.applyLink,
            resumeText,
            structuredResume,
          },
        ],
        userProfile
      );

      const result = results[0];

      const applicationId = insertApplication(
        jobUrl,
        result.success ? 'submitted' : 'failed',
        JSON.stringify({
          coverLetter,
          error: result.error,
          submittedAt: result.submittedAt,
        })
      );

      res.json({
        jobTitle: jobDescription.title,
        company: jobDescription.company,
        applicationId,
        success: result.success,
        error: result.error,
        coverLetter,
      });
    } finally {
      await jobCrawler.close();
      await applicationFiller.close();
    }
  } catch (error: any) {
    console.error('Error processing job application:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chrome extension endpoint: map extracted form fields to resume values
router.post('/map-fields', async (req, res) => {
  const { fields, resumeId, jobUrl } = req.body;

  if (!resumeId) return res.status(400).json({ error: 'resumeId is required' });
  if (!jobUrl) return res.status(400).json({ error: 'jobUrl is required' });
  if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });

  try {
    const result = await fieldMapper.mapFields(fields, resumeId, jobUrl);
    res.json(result);
  } catch (error: any) {
    if (error.message === 'Resume not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Map fields for a single structured entry (experience/education/project)
router.post('/map-entry-fields', (req, res) => {
  const { fields, entryType, entryData, resumeText, isCurrentJob } = req.body;
  if (!fields || !entryType || !entryData) {
    return res.status(400).json({ error: 'fields, entryType and entryData are required' });
  }
  try {
    const mappings = fieldMapper.mapEntryFields(fields, entryType, entryData, resumeText || '', !!isCurrentJob);
    res.json({ mappings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generate a PDF from cover letter text — used by extension for cover letter file inputs
router.post('/cover-letter-pdf', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="cover-letter.pdf"');
    doc.pipe(res);
    doc.font('Helvetica').fontSize(11).text(text, { lineGap: 4 });
    doc.end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get resume text by ID
async function getResumeText(resumeId: number): Promise<string | null> {
  try {
    const resume = getResumeById(resumeId) as any;
    return resume ? resume.text : null;
  } catch (error) {
    console.error('Error getting resume text:', error);
    return null;
  }
}

export default router;
