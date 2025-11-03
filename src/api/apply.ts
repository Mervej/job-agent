import express from 'express';
import { JobCrawler } from '../services/job-crawler';
import { CoverLetterGenerator } from '../services/cover-letter-generator';
import { ApplicationFiller } from '../services/application-filler';
import { insertApplication, getResumeById, getUserProfileFromResume } from '../services/db';
import path from 'path';

const router = express.Router();

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
    const userProfile = getUserProfileFromResume(resumeId);
    if (!userProfile || !userProfile.name || !userProfile.email) {
      return res.status(400).json({
        error:
          'Resume not found or missing user profile. Please upload resume with profile information first.',
      });
    }

    // Initialize services
    const jobCrawler = new JobCrawler();
    const coverLetterGenerator = new CoverLetterGenerator();
    const applicationFiller = new ApplicationFiller();

    try {
      // Step 1: Crawl job descriptions
      console.log('Crawling job descriptions...');
      const jobDescriptions = await jobCrawler.crawlMultipleJobs(jobUrls);

      if (jobDescriptions.length === 0) {
        return res.status(400).json({ error: 'No job descriptions could be extracted' });
      }

      // Step 2: Get resume text (you'll need to implement this)
      const resumeText = await getResumeText(resumeId);
      if (!resumeText) {
        return res.status(400).json({ error: 'Resume not found' });
      }

      // Step 3: Generate cover letters
      console.log('Generating cover letters...');
      const coverLetters = await coverLetterGenerator.generateMultipleCoverLetters(
        jobDescriptions,
        userProfile,
        resumeText
      );

      // Step 4: Fill applications
      console.log('Filling applications...');
      const applications = coverLetters.map((cl, index) => ({
        jobUrl: cl.jobUrl,
        coverLetter: cl.coverLetter,
        resumePath: path.join(__dirname, '..', 'data', 'resumes', `${resumeId}.pdf`),
        applyLink: jobDescriptions[index].applyLink, // Include the apply link if it's on a different page
        resumeText, // Include resume text for AI processing
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
        const coverLetter = coverLetters[i];

        const applicationId = insertApplication(
          jobDesc.url,
          result.success ? 'submitted' : 'failed',
          JSON.stringify({
            coverLetter: coverLetter.coverLetter,
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

    // Get user profile from stored resume
    const userProfile = getUserProfileFromResume(resumeId);
    if (!userProfile || !userProfile.name || !userProfile.email) {
      return res.status(400).json({
        error:
          'Resume not found or missing user profile. Please upload resume with profile information first.',
      });
    }

    // Initialize services
    const jobCrawler = new JobCrawler();
    const coverLetterGenerator = new CoverLetterGenerator();
    const applicationFiller = new ApplicationFiller();

    try {
      // Step 1: Crawl job description
      console.log('Crawling job description...');
      const jobDescription = await jobCrawler.crawlJobDescription(jobUrl);

      // Step 2: Get resume text
      const resumeText = await getResumeText(resumeId);
      if (!resumeText) {
        return res.status(400).json({ error: 'Resume not found' });
      }

      // Step 3: Generate cover letter
      console.log('Generating cover letter...');
      const coverLetter = await coverLetterGenerator.generateCoverLetter(
        jobDescription,
        userProfile,
        resumeText
      );

      // Step 4: Fill application
      console.log('Filling application...');
      const result = await applicationFiller.fillApplication(
        jobUrl,
        userProfile,
        coverLetter,
        path.join(__dirname, '..', 'data', 'resumes', `${resumeId}.pdf`),
        jobDescription.applyLink, // Pass applyLink if it's different from job page
        resumeText // Pass resume text for AI processing
      );

      // Step 5: Save to database
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
      // Clean up
      await jobCrawler.close();
      await applicationFiller.close();
    }
  } catch (error: any) {
    console.error('Error processing job application:', error);
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
