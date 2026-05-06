#!/bin/bash

# Job Agent Example Usage Script
# This script demonstrates how to use the enhanced Job Agent with user profiles

echo "🚀 Job Agent Example Usage"
echo "=========================="

# Set the base URL
BASE_URL="http://localhost:3000"

echo ""
echo "1. Upload Resume with User Profile"
echo "----------------------------------"
echo "Uploading resume with profile information..."

RESPONSE=$(curl -s -X POST \
  -F "file=@example-resume.pdf" \
  -F "name=John Doe" \
  -F "email=john.doe@example.com" \
  -F "phone=+1234567890" \
  -F "location=San Francisco, CA" \
  -F "linkedin=https://linkedin.com/in/johndoe" \
  -F "github=https://github.com/johndoe" \
  -F "experience=5 years of software development with focus on full-stack applications" \
  -F 'skills=["JavaScript", "TypeScript", "React", "Node.js", "Python", "AWS"]' \
  -F 'achievements=["Led team of 5 developers", "Increased application performance by 40%", "Reduced deployment time by 60%"]' \
  $BASE_URL/upload)

echo "Upload Response:"
echo $RESPONSE | jq '.'

# Extract resume ID from response
RESUME_ID=$(echo $RESPONSE | jq -r '.id')
echo ""
echo "Resume ID: $RESUME_ID"

echo ""
echo "2. List All Resumes"
echo "-------------------"
curl -s $BASE_URL/upload | jq '.'

echo ""
echo "3. Get User Profile for Resume $RESUME_ID"
echo "------------------------------------------"
curl -s $BASE_URL/upload/$RESUME_ID/profile | jq '.'

echo ""
echo "4. Update User Profile"
echo "----------------------"
curl -s -X PUT $BASE_URL/upload/$RESUME_ID/profile \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1987654321",
    "location": "New York, NY",
    "skills": ["JavaScript", "TypeScript", "React", "Node.js", "Python", "AWS", "Docker", "Kubernetes"]
  }' | jq '.'

echo ""
echo "5. Apply to Multiple Jobs"
echo "-------------------------"
echo "Applying to multiple job postings..."

APPLY_RESPONSE=$(curl -s -X POST $BASE_URL/apply/jobs \
  -H "Content-Type: application/json" \
  -d "{
    \"jobUrls\": [
      \"https://example-company1.com/job/software-engineer\",
      \"https://example-company2.com/job/full-stack-developer\"
    ],
    \"resumeId\": $RESUME_ID
  }")

echo "Application Response:"
echo $APPLY_RESPONSE | jq '.'

echo ""
echo "6. Apply to Single Job"
echo "----------------------"
echo "Applying to a single job posting..."

SINGLE_APPLY_RESPONSE=$(curl -s -X POST $BASE_URL/apply/job \
  -H "Content-Type: application/json" \
  -d "{
    \"jobUrl\": \"https://example-company3.com/job/senior-developer\",
    \"resumeId\": $RESUME_ID
  }")

echo "Single Application Response:"
echo $SINGLE_APPLY_RESPONSE | jq '.'

echo ""
echo "✅ Example completed!"
echo ""
echo "Note: Make sure to:"
echo "1. Start the server with 'npm run dev'"
echo "2. Have a PDF file named 'example-resume.pdf' in the current directory"
echo "3. Update the job URLs to real job postings for testing"
echo "4. Set up your AI provider (OpenAI or Ollama) in .env file"

# Example: Apply to a job where apply is on a different page (e.g., Stripe)
# The agent will automatically detect the apply link and navigate to it
curl -X POST http://localhost:3000/api/apply/job \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://stripe.com/jobs/listing/software-engineer-operations-platform/7108247",
    "resumeId": 1
  }'

# Example: Apply to multiple jobs with mixed scenarios
# Some may have apply on same page, others on different pages
curl -X POST http://localhost:3000/api/apply/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrls": [
      "https://example-board.com/jobs/123",           # Apply on same page
      "https://stripe.com/jobs/listing/...",           # Apply on different page
      "https://github.com/jobs/456"                    # Apply on same page
    ],
    "resumeId": 1
  }'
