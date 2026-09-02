import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Toda migration listada aqui já foi aplicada no ambiente remoto e é imutável.
// Qualquer correção futura deve ser feita em uma nova migration.
const immutableChecksums = {
    "001_initial_schema.sql": "63885893d3307157c25c7fa92aaf45bfb89337ae9b7d5933a8431a609611f543",
    "002_global_login_identifiers.sql": "5f3e0aa9779fec0cf692f3adc9003d313cfefe11c90196c37493acc610a93e1d",
    "003_recruitment.sql": "27235e3760760f041f6f0beedc5cf72497341fc4fd74810eaa60016c4604c34f",
    "004_corporate_calendar.sql": "12eb54f442ac552e877aa11649c7451cd74619c5b895ba149cbd715d43b4ad8a",
    "005_trainings_and_exams.sql": "387faa7395bcd32cf6952054cadfa688009d288a4b28a3441fb2c4ae07e27ee4",
    "006_journeys_and_onboarding.sql": "b900574880da32f267ba06a74337c9856f28bcfebd5b11115478528e5647930a",
    "007_performance_evaluations.sql": "6b2ee52a49aa1374fb59e6dfcc740f9c6416f31eafcfa69ded5c59b2b8aee36a",
    "008_development_and_career.sql": "424f6f15bd7bad98e49d5d6ac4063380aec6876418950d7f8ec0e0db793aea08",
    "009_notifications_and_pending_center.sql": "e714a30c0704a8d4e4f2fad476765b504107b967aaf804f1c83e94a8c610d012",
    "010_row_level_security.sql": "2ea6e261b472740df85b6d72ffeb9cbe88724324056e2e0252586f21421d8b63",
    "011_multi_factor_authentication.sql": "dc75031db440522a26598112963be0ec8a3dd3994ac9c5b9d670803dca436c19",
    "012_mfa_replay_protection.sql": "cd7d73704a735c37730d89a1962bb37a98616955842856c37831669c0cd6746d",
    "013_account_lifecycle_and_delivery.sql": "63d7782ab07b39d39c0fe2040ccba6816d07e2ad4eb8670038ae9995168e2aff",
    "014_notification_automation.sql": "ec80422c72dc5a3b73f49fdbd05ca6b3052ac8686c7045ebee8f39a6460e3f78",
    "015_private_files_and_privacy.sql": "91345d85163f8f25fd451e3dcebeadad4e0cd05e5fc2eecf3c390c842bd03aca",
    "016_correct_legacy_notification_description.sql": "19dbfaeb5ff899a3df01fd1096e84352420b35071aabb679d4c6d2324a1973b6",
};

test("preserva os bytes de todas as migrations já aplicadas", async () => {
    for (const [filename, expected] of Object.entries(immutableChecksums)) {
        const content = await readFile(`database/migrations/${filename}`);
        const checksum = createHash("sha256").update(content).digest("hex");
        assert.equal(checksum, expected, filename);
    }
});
